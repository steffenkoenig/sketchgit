import subprocess
import os

# Commit message without double-spacing
commit_msg = """feat: [platform] create new platform improvement plans

Created proposals/new_improvements.md containing implementation plans for:
1. Threaded Canvas Comments
2. Advanced Layer Management
3. Customizable Keyboard Shortcuts

Each plan includes the goal, problem, proposed changes, definition of done,
and a future press release. None of the proposals rely on AI or non-email
external connections.
"""

with open("commit_msg.txt", "w") as f:
    f.write(commit_msg)

subprocess.run(["git", "commit", "--amend", "-F", "commit_msg.txt"])
os.remove("commit_msg.txt")
