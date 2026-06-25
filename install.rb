#!/usr/bin/env ruby
# frozen_string_literal: true

# Install or uninstall the /aws Claude Code skill system-wide.
# Usage: ruby install.rb [--uninstall]  (or ./install.rb)

require "fileutils"

REPO_DIR   = __dir__
SKILL_DIR  = File.join(Dir.home, ".claude", "skills", "aws")
SKILL_LINK = File.join(SKILL_DIR, "SKILL.md")
SKILL_SRC  = File.join(REPO_DIR, "SKILL.md")
BIN_DIR    = File.join(Dir.home, "bin")
CLI_LINK   = File.join(BIN_DIR, "aws-skill")
CLI_SRC    = File.join(REPO_DIR, "bin", "aws-skill")

def force_symlink(src, link)
  File.delete(link) if File.symlink?(link) || File.exist?(link)
  File.symlink(src, link)
end

if ARGV[0] == "--uninstall"
  if File.symlink?(SKILL_LINK)
    File.delete(SKILL_LINK)
    puts "Uninstalled /aws (removed #{SKILL_LINK})"
  else
    puts "Nothing to uninstall (#{SKILL_LINK} is not a symlink)"
  end
  if File.symlink?(CLI_LINK)
    File.delete(CLI_LINK)
    puts "Uninstalled aws-skill CLI (removed #{CLI_LINK})"
  end
  exit 0
end

FileUtils.mkdir_p(SKILL_DIR)
force_symlink(SKILL_SRC, SKILL_LINK)
puts "Installed /aws -> #{SKILL_SRC}"

FileUtils.mkdir_p(BIN_DIR)
force_symlink(CLI_SRC, CLI_LINK)
puts "Installed aws-skill CLI -> #{CLI_SRC}"

unless ENV.fetch("PATH", "").split(File::PATH_SEPARATOR).include?(BIN_DIR)
  puts "Warning: #{BIN_DIR} is not on your PATH. Add it so 'aws-skill' resolves."
end
