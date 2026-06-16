use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tokio::fs;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    pub is_directory: bool,
    pub size: u64,
    pub children: Option<Vec<FileNode>>,
}

const IGNORED_DIRS: &[&str] = &[
    "node_modules",
    ".git",
    "target",
    ".godot",
    ".mono",
    "bin",
    "obj",
    "__pycache__",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
    ".tox",
    "eggs",
    "*.egg-info",
];

fn should_ignore(name: &str) -> bool {
    IGNORED_DIRS.iter().any(|ignored| {
        if ignored.starts_with('*') {
            name.ends_with(&ignored[1..])
        } else {
            name == *ignored
        }
    })
}

fn relative_path(full_path: &str, root: &str) -> String {
    full_path
        .strip_prefix(root)
        .unwrap_or(full_path)
        .trim_start_matches(['/', '\\'])
        .to_string()
}

async fn build_tree_recursive(path: &Path, root: &Path) -> std::io::Result<FileNode> {
    let metadata = fs::metadata(path).await?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let abs_path = path.to_string_lossy().into_owned();
    let rel_path = relative_path(&abs_path, &root.to_string_lossy());

    if metadata.is_dir() {
        let mut children = Vec::new();
        let mut entries = fs::read_dir(path).await?;

        while let Some(entry) = entries.next_entry().await? {
            let entry_name = entry.file_name().to_string_lossy().into_owned();
            if should_ignore(&entry_name) {
                continue;
            }
            let child = build_tree_recursive(&entry.path(), root).await?;
            children.push(child);
        }

        children.sort_by(|a, b| {
            if a.is_directory == b.is_directory {
                a.name.to_lowercase().cmp(&b.name.to_lowercase())
            } else if a.is_directory {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            }
        });

        Ok(FileNode {
            name,
            path: abs_path,
            relative_path: rel_path,
            is_directory: true,
            size: metadata.len(),
            children: Some(children),
        })
    } else {
        Ok(FileNode {
            name,
            path: abs_path,
            relative_path: rel_path,
            is_directory: false,
            size: metadata.len(),
            children: None,
        })
    }
}

pub async fn scan_directory(root_path: &str) -> Result<FileNode, String> {
    let root = PathBuf::from(root_path);

    if !root.exists() {
        return Err(format!("Directory does not exist: {}", root_path));
    }

    if !root.is_dir() {
        return Err(format!("Path is not a directory: {}", root_path));
    }

    build_tree_recursive(&root, &root)
        .await
        .map_err(|e| format!("Failed to scan directory '{}': {}", root_path, e))
}
