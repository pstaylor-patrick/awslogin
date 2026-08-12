# frozen_string_literal: true

require "minitest/autorun"
require "fileutils"
require "tmpdir"

REPO = File.expand_path("..", __dir__)
load File.join(REPO, "bin", "awslogin")

def capture(argv, home, extra_env = {})
  output = IO.popen({ "HOME" => home }.merge(extra_env), argv, err: %i[child out], &:read)
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

  [profile j2j-dns]
  sso_start_url = https://j2j-dns.awsapps.com/start

  [profile amfm-production]
  sso_session = amfm-sso

  [profile amfm-dns]
  sso_session = amfm-sso

  [profile AMFM-staging]
  sso_session = amfm-sso

  [profile advantag-sports-prod]
  sso_start_url = https://advantag.awsapps.com/start

  [profile advantage-sports-prod]
  sso_session = advantage-sports
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
    assert_equal({ name: "personal-sso", label: "sso-session personal-sso", profiles: %w[personal j2j] },
                 AwsLogin.login_targets(SAMPLE).first)
  end

  def test_includes_sessions_with_no_sso_session_block_of_their_own
    labels = AwsLogin.login_targets(SAMPLE).map { |target| target[:label] }
    assert_includes labels, "sso-session servant-sso"
  end

  def test_gives_legacy_inline_sso_profiles_their_own_target
    assert_includes AwsLogin.login_targets(SAMPLE),
                    { name: "legacy", label: "profile legacy", profiles: ["legacy"] }
  end

  def test_skips_profiles_with_no_sso_configuration
    profiles = AwsLogin.login_targets(SAMPLE).flat_map { |target| target[:profiles] }
    refute_includes profiles, "static-creds"
  end

  def test_treats_the_default_section_as_a_profile
    assert_equal [{ name: "s", label: "sso-session s", profiles: ["default"] }],
                 AwsLogin.login_targets("[default]\nsso_session = s\n")
  end

  def test_returns_nothing_for_a_config_with_no_sso_profiles
    assert_empty AwsLogin.login_targets("[profile p]\nregion = us-east-1\n")
  end

  def test_names_a_session_target_after_its_session_and_a_legacy_target_after_its_profile
    names = AwsLogin.login_targets(SAMPLE).map { |target| target[:name] }
    assert_equal %w[personal-sso servant-sso legacy j2j-dns amfm-sso advantag-sports-prod advantage-sports],
                 names
  end
end

class DescribeTest < Minitest::Test
  def test_labels_a_target_with_the_profiles_it_covers
    assert_equal "sso-session personal-sso: personal, j2j",
                 AwsLogin.describe({ name: "personal-sso", label: "sso-session personal-sso",
                                      profiles: %w[personal j2j] })
  end
end

class ResolveTest < Minitest::Test
  def setup
    @targets = AwsLogin.login_targets(SAMPLE)
  end

  def test_an_exact_profile_name_resolves_to_the_target_that_covers_it
    assert_equal ["sso-session amfm-sso"], labels(AwsLogin.resolve(@targets, "amfm-dns"))
  end

  def test_an_exact_name_matches_regardless_of_case
    assert_equal ["sso-session amfm-sso"], labels(AwsLogin.resolve(@targets, "amfm-staging"))
    assert_equal ["sso-session amfm-sso"], labels(AwsLogin.resolve(@targets, "AMFM-DNS"))
  end

  def test_a_session_name_resolves_to_that_session_group
    assert_equal ["sso-session servant-sso"], labels(AwsLogin.resolve(@targets, "servant-sso"))
  end

  def test_a_name_matching_nothing_is_an_error_that_points_at_list
    error = assert_raises(AwsLogin::Error) { AwsLogin.resolve(@targets, "nope") }
    assert_equal 'No login target matches "nope". Run `awslogin list` to see them all.', error.message
  end

  def test_a_substring_resolves_when_it_lands_on_one_target
    matched = AwsLogin.resolve(@targets, "advantage")
    assert_equal ["sso-session advantage-sports"], labels(matched)
    refute_includes labels(matched), "profile advantag-sports-prod"
  end

  def test_a_substring_covering_a_whole_session_group_is_one_target
    matched = AwsLogin.resolve(@targets, "amfm")
    assert_equal ["sso-session amfm-sso"], labels(matched)
    assert_equal [%w[amfm-production amfm-dns AMFM-staging]], matched.map { |target| target[:profiles] }
  end

  def test_a_name_matching_unrelated_targets_is_an_error_that_lists_them
    error = assert_raises(AwsLogin::Error) { AwsLogin.resolve(@targets, "prod") }
    assert_equal <<~MESSAGE.chomp, error.message
      "prod" matches 3 login targets:
        sso-session amfm-sso: amfm-production, amfm-dns, AMFM-staging
        profile advantag-sports-prod: advantag-sports-prod
        sso-session advantage-sports: advantage-sports-prod
      Use more of the name, or an exact profile or sso-session name.
    MESSAGE
  end

  def test_a_near_duplicate_spelling_is_reported_as_ambiguous
    error = assert_raises(AwsLogin::Error) { AwsLogin.resolve(@targets, "advantag") }
    assert_includes error.message, '"advantag" matches 2 login targets:'
    assert_includes error.message, "profile advantag-sports-prod: advantag-sports-prod"
    assert_includes error.message, "sso-session advantage-sports: advantage-sports-prod"
  end

  def test_an_exact_name_wins_over_targets_it_is_only_a_substring_of
    assert_equal ["sso-session personal-sso"], labels(AwsLogin.resolve(@targets, "j2j"))
  end

  private

  def labels(targets)
    targets.map { |target| target[:label] }
  end
end

class SelectTargetsTest < Minitest::Test
  def setup
    @targets = AwsLogin.login_targets(SAMPLE)
  end

  def test_unions_the_targets_for_several_names_in_config_order
    assert_equal ["sso-session personal-sso", "sso-session amfm-sso"],
                 labels(AwsLogin.select_targets(@targets, %w[amfm j2j]))
  end

  def test_lists_a_target_once_when_two_names_resolve_to_it
    assert_equal ["sso-session amfm-sso"],
                 labels(AwsLogin.select_targets(@targets, %w[amfm amfm-dns]))
  end

  def test_selects_nothing_for_no_names
    assert_empty AwsLogin.select_targets(@targets, [])
  end

  def test_one_ambiguous_name_fails_the_whole_selection
    error = assert_raises(AwsLogin::Error) { AwsLogin.select_targets(@targets, %w[servant prod]) }
    assert_includes error.message, '"prod" matches 3 login targets:'
  end

  def test_one_unmatched_name_fails_the_whole_selection
    error = assert_raises(AwsLogin::Error) { AwsLogin.select_targets(@targets, %w[servant nope]) }
    assert_includes error.message, 'No login target matches "nope"'
  end

  private

  def labels(targets)
    targets.map { |target| target[:label] }
  end
end

class CliTest < Minitest::Test
  def test_list_prints_one_line_per_target
    with_config do |home|
      status, output = run_cli(home, "list")
      assert_equal 0, status
      assert_equal ["sso-session personal-sso: personal, j2j", "sso-session servant-sso: servant",
                    "profile legacy: legacy", "profile j2j-dns: j2j-dns",
                    "sso-session amfm-sso: amfm-production, amfm-dns, AMFM-staging",
                    "profile advantag-sports-prod: advantag-sports-prod",
                    "sso-session advantage-sports: advantage-sports-prod"], output.split("\n")
    end
  end

  def test_list_fails_when_the_config_has_no_sso_profiles
    with_config("[profile p]\nregion = us-east-1\n") do |home|
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

  def test_list_narrows_to_the_named_targets
    with_config do |home|
      status, output = run_cli(home, "list", "amfm")
      assert_equal 0, status
      assert_equal ["sso-session amfm-sso: amfm-production, amfm-dns, AMFM-staging"], output.split("\n")
    end
  end

  def test_a_name_on_its_own_logs_into_that_target
    with_fake_aws do |home, log, env|
      status, output = run_cli(home, "amfm", env: env)
      assert_equal 0, status
      assert_includes output, "==> sso-session amfm-sso: amfm-production, amfm-dns, AMFM-staging"
      assert_equal ["sso login --profile amfm-production"], File.read(log).split("\n")
    end
  end

  def test_the_device_code_flag_composes_with_a_name
    with_fake_aws do |home, log, env|
      status, = run_cli(home, "login", "servant", "--use-device-code", env: env)
      assert_equal 0, status
      assert_equal ["sso login --profile servant --use-device-code --no-browser"], File.read(log).split("\n")
    end
  end

  def test_several_names_log_into_each_target_in_config_order
    with_fake_aws do |home, log, env|
      status, = run_cli(home, "login", "amfm", "servant", env: env)
      assert_equal 0, status
      assert_equal ["sso login --profile servant", "sso login --profile amfm-production"],
                   File.read(log).split("\n")
    end
  end

  def test_an_ambiguous_name_logs_into_nothing
    with_fake_aws do |home, log, env|
      status, output = run_cli(home, "login", "servant", "prod", env: env)
      assert_equal 2, status
      assert_includes output, '"prod" matches 3 login targets:'
      assert_includes output, "Use more of the name, or an exact profile or sso-session name."
      refute File.exist?(log)
    end
  end

  def test_an_unmatched_name_reports_no_match
    with_fake_aws do |home, log, env|
      status, output = run_cli(home, "bogus", env: env)
      assert_equal 2, status
      assert_includes output, 'No login target matches "bogus"'
      refute File.exist?(log)
    end
  end

  def test_an_unknown_flag_prints_usage
    with_config do |home|
      status, output = run_cli(home, "list", "--bogus")
      assert_equal 2, status
      assert_includes output, "Usage: awslogin [list|login] [name ...] [--use-device-code]"
    end
  end

  private

  def with_config(config = SAMPLE)
    Dir.mktmpdir do |home|
      FileUtils.mkdir_p(File.join(home, ".aws"))
      File.write(File.join(home, ".aws", "config"), config)
      yield home
    end
  end

  def with_fake_aws(config = SAMPLE)
    with_config(config) do |home|
      bin = File.join(home, "bin")
      FileUtils.mkdir_p(bin)
      File.write(File.join(bin, "aws"), %(#!/bin/sh\necho "$*" >> "$AWS_LOG"\n))
      FileUtils.chmod(0o755, File.join(bin, "aws"))
      log = File.join(home, "aws.log")
      yield home, log, { "PATH" => "#{bin}:#{ENV.fetch("PATH")}", "AWS_LOG" => log }
    end
  end

  def run_cli(home, *args, env: {})
    capture(["ruby", File.join(REPO, "bin", "awslogin"), *args], home, env)
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
