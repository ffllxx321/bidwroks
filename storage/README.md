# BidWorks File Storage Sandbox Workspace

This directory is an isolated repository node handling file uploads, parsed slices, and temporary staging artifacts.

## Directory Layout
- `/uploads/` : Raw uploaded files (grouped under project-specific UUID structures to enforce system data boundaries).
- `/parsed/`  : Clean text logs, tabular outputs, or structural `.json` parsing documents.
- `/temp/`    : Transient files generated during active processing, purged during routine maintenance.

## Safety & Isolation Mandates (Rule 2)
1. **Never physical overwrite**: Existing uploads on identical task targets write new version rows into the files database linked to fresh relative paths (e.g., `uploads/proj-001/task-102_v2.docx`).
2. **Access Control**: Physical files inside this storage structure are inaccessible directly via standard static web servers. Access demands streaming via `/api/documents/:id/download` after JWT verification.
