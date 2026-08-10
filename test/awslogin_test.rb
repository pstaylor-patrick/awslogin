# frozen_string_literal: true

require "minitest/autorun"
require "fileutils"
require "tmpdir"

REPO = File.expand_path("..", __dir__)
load File.join(REPO, "bin", "awslogin")

def capture(argv, home)
  output = IO.popen({ "HOME" => home }, argv, err: %i[child out], &:read)
  [$?.exitstatus, output]
end

SAMPLE = <<~CONFIG
  [sso-session personal-sso]
  sso_start_url = https://example.awsapps.com/start
  sso_region = us-east-1

  # a comment
  [profile personal]
  sso_session = personal-sso
  sso_account_id = 000000000000

  [profile j2j]
  sso_session = personal-sso

  [profile servant]
  sso_session = servant-sso

  [profile legacy]
  sso_start_url = https://legacy.awsapps.com/start

  [profile static-creds]
  region = us-west-2
CONFIG

class ParseIniTest < Minitest::Test
  def test_reads_key_value_pairs_into_the_enclosing_section
    assert_equal({ "sso_start_url" => "https://example.awsapps.com/start", "sso_region" => "us-east-1" },
                 AwsLogin.parse_ini(SAMPLE)["sso-session personal-sso"])
  end

  def test_keeps_everything_after_the_first_equals_in_the_value
    sections = AwsLogin.parse_ini("[profile p]\nsso_start_url = https://x/start?a=b\n")
    assert_equal "https://x/start?a=b", sections["profile p"]["sso_start_url"]
  end

  def test_ignores_comments_blank_lines_keyless_lines_and_text_before_any_section
    text = "stray = 1\n\n; semi\n[profile p]\nnoequals\nregion = us-east-1\n"
    assert_equal({ "profile p" => { "region" => "us-east-1" } }, AwsLogin.parse_ini(text))
  end

  def test_merges_a_section_header_that_appears_twice
    sections = AwsLogin.parse_ini("[profile p]\na = 1\n[profile p]\nb = 2\n")
    assert_equal({ "a" => "1", "b" => "2" }, sections["profile p"])
  end
end

class LoginTargetsTest < Minitest::Test
  def test_groups_profiles_sharing_an_sso_session_into_one_login
    assert_equal({ label: "sso-session personal-sso", profiles: %w[personal j2j] },
                 AwsLogin.login_targets(SAMPLE).first)
  end

  def test_includes_sessions_with_no_sso_session_block_of_their_own
    labels = AwsLogin.login_targets(SAMPLE).map { |target| target[:label] }
    assert_includes labels, "sso-session servant-sso"
  end

  def test_gives_legacy_inline_sso_profiles_their_own_target
    assert_includes AwsLogin.login_targets(SAMPLE), { label: "profile legacy", profiles: ["legacy"] }
  end

  def test_skips_profiles_with_no_sso_configuration
    profiles = AwsLogin.login_targets(SAMPLE).flat_map { |target| target[:profiles] }
    refute_includes profiles, "static-creds"
  end

  def test_treats_the_default_section_as_a_profile
    assert_equal [{ label: "sso-session s", profiles: ["default"] }],
                 AwsLogin.login_targets("[default]\nsso_session = s\n")
  end

  def test_returns_nothing_for_a_config_with_no_sso_profiles
    assert_empty AwsLogin.login_targets("[profile p]\nregion = us-east-1\n")
  end
end

class DescribeTest < Minitest::Test
  def test_labels_a_target_with_the_profiles_it_covers
    assert_equal "sso-session personal-sso: personal, j2j",
                 AwsLogin.describe({ label: "sso-session personal-sso", profiles: %w[personal j2j] })
  end
end

class CliTest < Minitest::Test
  def test_list_prints_one_line_per_target
    Dir.mktmpdir do |home|
      FileUtils.mkdir_p(File.join(home, ".aws"))
      File.write(File.join(home, ".aws", "config"), SAMPLE)
      status, output = run_cli(home, "list")
      assert_equal 0, status
      assert_equal ["sso-session personal-sso: personal, j2j", "sso-session servant-sso: servant",
                    "profile legacy: legacy"], output.split("\n")
    end
  end

  def test_list_fails_when_the_config_has_no_sso_profiles
    Dir.mktmpdir do |home|
      FileUtils.mkdir_p(File.join(home, ".aws"))
      File.write(File.join(home, ".aws", "config"), "[profile p]\nregion = us-east-1\n")
      status, output = run_cli(home, "list")
      assert_equal 1, status
      assert_includes output, "No SSO profiles found"
    end
  end

  def test_missing_config_fails
    Dir.mktmpdir do |home|
      status, output = run_cli(home, "list")
      assert_equal 1, status
      assert_includes output, "Cannot read"
    end
  end

  def test_unknown_command_prints_usage
    Dir.mktmpdir do |home|
      status, output = run_cli(home, "bogus")
      assert_equal 2, status
      assert_includes output, "Usage: awslogin"
    end
  end

  private

  def run_cli(home, *args)
    capture(["ruby", File.join(REPO, "bin", "awslogin"), *args], home)
  end
end

class InstallTest < Minitest::Test
  def test_installs_symlinks_for_the_skill_and_the_cli
    Dir.mktmpdir do |home|
      status, output = install(home)
      assert_equal 0, status
      assert_includes output, "Installed /awslogin ->"
      assert_includes output, "Installed awslogin CLI ->"
      assert_equal File.join(REPO, "SKILL.md"), File.readlink(skill_link(home))
      assert_equal File.join(REPO, "bin", "awslogin"), File.readlink(cli_link(home))
    end
  end

  def test_replaces_a_stale_symlink_and_is_idempotent
    Dir.mktmpdir do |home|
      FileUtils.mkdir_p(File.dirname(skill_link(home)))
      File.symlink(File.join(home, "stale"), skill_link(home))
      install(home)
      assert_equal 0, install(home).first
      assert_equal File.join(REPO, "SKILL.md"), File.readlink(skill_link(home))
    end
  end

  def test_uninstall_removes_both_symlinks
    Dir.mktmpdir do |home|
      install(home)
      status, output = install(home, "--uninstall")
      assert_equal 0, status
      assert_includes output, "Uninstalled /awslogin"
      refute File.symlink?(skill_link(home))
      refute File.symlink?(cli_link(home))
    end
  end

  def test_uninstall_is_a_safe_no_op_when_nothing_is_installed
    Dir.mktmpdir do |home|
      status, output = install(home, "--uninstall")
      assert_equal 0, status
      assert_includes output, "Nothing to uninstall"
    end
  end

  private

  def install(home, *args)
    capture(["ruby", File.join(REPO, "install.rb"), *args], home)
  end

  def skill_link(home)
    File.join(home, ".claude", "skills", "awslogin", "SKILL.md")
  end

  def cli_link(home)
    File.join(home, "bin", "awslogin")
  end
end
