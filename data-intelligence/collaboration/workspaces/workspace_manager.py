#!/usr/bin/env python3
"""Multi-User Workspace System"""

import json
from pathlib import Path
from typing import Dict, List


class WorkspaceManager:
    """Manage multi-user workspaces"""

    def __init__(self, workspace_dir: Path = None):
        self.workspace_dir = workspace_dir or Path('data-intelligence/lakehouse/workspaces')
        self.workspace_dir.mkdir(parents=True, exist_ok=True)

    def create_workspace(self, workspace_id: str, owner: str, members: List[str]) -> Dict:
        """Create new workspace"""
        workspace = {
            'workspace_id': workspace_id,
            'owner': owner,
            'members': members,
            'created_at': datetime.now().isoformat(),
            'shared_tasks': [],
            'shared_knowledge': []
        }

        workspace_file = self.workspace_dir / f'{workspace_id}.json'
        with open(workspace_file, 'w') as f:
            json.dump(workspace, f, indent=2)

        return workspace

    def share_task(self, workspace_id: str, task_id: str):
        """Share task with workspace"""
        workspace_file = self.workspace_dir / f'{workspace_id}.json'
        with open(workspace_file, 'r') as f:
            workspace = json.load(f)

        workspace['shared_tasks'].append(task_id)

        with open(workspace_file, 'w') as f:
            json.dump(workspace, f, indent=2)


if __name__ == '__main__':
    manager = WorkspaceManager()
    print("Workspace manager initialized")
