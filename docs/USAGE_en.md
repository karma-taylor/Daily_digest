<p>
  <img src="../logo.png" alt="HamHome" width="280" />
</p>

# HamHome Usage Guide

This guide focuses on day-to-day usage and common settings. For building from source / development, see the repo root `README.md`.

## Table of contents

- [Install & first launch](#install--first-launch)
- [Save a bookmark quickly](#save-a-bookmark-quickly)
- [Open the in-page sidebar panel](#open-the-in-page-sidebar-panel)
- [Search (keyword / AI chat)](#search-keyword--ai-chat)
- [Categories & tags](#categories--tags)
- [Page snapshots (offline)](#page-snapshots-offline)
- [Import / export & backup](#import--export--backup)
- [Privacy & security](#privacy--security)
- [Shortcuts & customization](#shortcuts--customization)
- [FAQ](#faq)

## Install & first launch

1. Install from your browser’s extension store (or download from Releases and install manually).
2. After installation, the settings page may open automatically. Later, you can open it via:
   - Right-click the extension icon → “Options / Settings”
   - The settings entry inside HamHome’s panel/pages

## Save a bookmark quickly

Open the “Save panel” and bookmark the current page using any of:

- Click the HamHome icon in the browser toolbar
- Right-click the page → “Save to HamHome”
- Use a shortcut (customizable in the browser; suggested default: `Ctrl+Shift+X` / `Command+Shift+X`)

In the save panel, you can:

- Review/edit `Title`, `Description`, `Category`, `Tags`
- Click “Get Suggestions” to let AI generate description and recommend category/tags (requires AI configuration)
- Save a page snapshot (if “Auto-save snapshot” is enabled, it saves automatically when bookmarking)

Tip: If the page is already bookmarked, the save panel will show an “already bookmarked” hint — you can update its information directly.

## Open the in-page sidebar panel

HamHome can show an in-page sidebar panel (Content UI) on any webpage for fast search and open:

- Toggle via shortcut (suggested default: `Ctrl+Shift+L` / `Command+Shift+L`)
- Move the cursor to the screen edge, then click the edge trigger bar

You can also choose whether the panel appears on the left or right in settings.

## Search (keyword / AI chat)

In the search bar of the panel/management page:

- **Keyword search**: good for exact matches on title/URL/tags
- **AI chat search**: switch to AI mode and ask in natural language (e.g. “Find React articles I saved last week”)

In AI mode, answers include clickable sources (jump to the referenced bookmarks) and follow-up suggestions.

## Categories & tags

### Categories

In the “Categories” page, you can create/edit/delete categories and build a hierarchical tree.

If you don’t have a category system yet, you can:

- Apply a built-in preset scheme with one click
- Use “AI-generated categories”: describe your scenario and let AI propose a category structure (requires AI configuration)

### Tags

In the “Tags” page, you can view and manage all tags (including stats and a tag cloud). You can also add tags when saving a bookmark.

If you want more consistent AI tag suggestions, configure “Preset tags” in AI settings — AI will prioritize matching these tags.

## Page snapshots (offline)

Snapshots save the page HTML locally, so you can:

- Still read content when the original link is dead
- Read offline (depending on the page’s assets)

Snapshots may take a lot of space. Consider checking storage usage regularly and turning off “Auto-save snapshot” if needed.

## Import / export & backup

In the “Import / Export” page:

- **Export JSON**: full backup for migration/restore
- **Export HTML**: a browsable static HTML file
- **Import**: supports HamHome JSON exports and browser bookmark HTML exports (Chrome/Firefox/Edge)

Common import options:

- “Preserve folder structure”: map browser folders into categories
- “AI auto-categorize & tag”: let AI generate description/category/tags during import (mutually exclusive with preserving folder structure)
- “Fetch page content for analysis”: visit URLs to improve AI accuracy (slower)

## Privacy & security

- **Local-first**: bookmarks and settings are stored locally (Chrome Storage + IndexedDB)
- **API key stays local**: your AI API key is stored locally and used to talk directly to the provider
- **Privacy domains**: add domains (e.g. `example.com`) to skip AI analysis for those pages

When AI analysis is enabled, the following data may be sent to your AI provider for generating descriptions/tags:

- Page URL
- Page title
- Page content excerpt (used for description and tag generation)

## Shortcuts & customization

You can customize extension shortcuts in your browser:

- Chrome: `chrome://extensions/shortcuts`
- Edge: `edge://extensions/shortcuts`
- Firefox: manage extension shortcuts in `about:addons`

Recommended shortcuts to set:

- Open the save panel (bookmark current page)
- Toggle the in-page sidebar panel

## FAQ

### 1) “AI not configured”

You can still bookmark manually. To enable AI description/category/tags and AI chat search, open “Settings → AI” and configure your provider + API key, then test the connection.

### 2) AI search feels weak / no results

Check these first:

- Whether “Semantic search (Embedding)” is enabled and the index has been built (see coverage and rebuild actions in settings)
- Whether your bookmarks have enough title/description/content (older imports may be sparse)

### 3) Storage keeps growing

Snapshots take space. You can disable auto-save snapshots, export backups, and clear data as needed in storage management.

