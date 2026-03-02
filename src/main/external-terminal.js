'use strict';

const { exec } = require('child_process');

function escapeAppleScript(str) {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function openInTerminalApp(projectPath, runClaude = true) {
  return new Promise((resolve, reject) => {
    const escapedPath = escapeAppleScript(projectPath);
    const command = runClaude
      ? `cd "${escapedPath}" && claude`
      : `cd "${escapedPath}"`;

    const termProgram = process.env.TERM_PROGRAM;

    let script;
    if (termProgram === 'iTerm.app' || termProgram === 'iTerm2') {
      script = `
        tell application "iTerm"
          activate
          set newWindow to (create window with default profile command "/bin/zsh -c '${escapeAppleScript(command)}'")
        end tell
      `;
    } else {
      script = `
        tell application "Terminal"
          activate
          do script "${escapeAppleScript(command)}"
        end tell
      `;
    }

    exec(`osascript -e '${script.replace(/'/g, "'\\''")}'`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

module.exports = {
  openInTerminalApp,
};
