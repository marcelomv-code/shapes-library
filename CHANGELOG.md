# Changelog

All notable changes to the PowerPoint Shapes Library extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.2] - 2026-01-18

### Fixed
- 🔧 **Footer/Slide Number Bug**: Fixed issue where footer placeholders (footer text, slide number, date) were being pasted along with shapes
  - Shapes copied from the library no longer include unwanted slide footer elements
  - Filter now excludes PowerPoint placeholder types 6 (Footer), 13 (SlideNumber), and 16 (Date)
- 🔧 **Copyright Text Bug**: Fixed issue where copyright text boxes from slide templates were being included when copying shapes
  - Added filter to exclude text boxes containing "Copyright" or "©" symbols
  - Ensures only the intended shapes are copied to clipboard

## [1.3.1] - 2025-12-12

### Fixed
- 📝 **Documentation**: Replaced Mac terminology (Cmd, Finder) with Windows equivalents (Ctrl, File Explorer) in README and CHANGELOG

## [1.3.0] - 2025-12-12

### Added
- 🚀 **Customizable Categories UI**: New "Manage Categories" command to add, rename, and delete categories directly from the extension
- 🎯 **Dynamic Category System**: Categories are now stored in `{LibraryRoot}/categories.json` and can be customized without editing code
- ⌨️ **Quick Access**: Press `Ctrl+M` in Shape Picker to open category management
- 🔗 **Smart Navigation**: Open Shape Picker filtered by selected category from Manage Categories (`Ctrl+O`)

### Changed
- 📁 **Categories Location**: Moved from static `src/config/categories.json` to user-configurable `{LibraryRoot}/categories.json`
- 🎨 **UI Cleanup**: Removed technical IDs from category list, showing only display names
- ⚙️ **Settings Simplification**: Removed static "Default Category" dropdown from preferences (always opens on "All Shapes")

### Removed
- 🗑️ **Static Categories File**: Removed `src/config/categories.json` (migrated to Library folder)

## [1.2.2] - 2025-01-31

### Removed
- **"Save Native Now" action**: Removed as problematic and redundant
  - Action generated native PPTX using `pptxgenjs` (synthetic generation)
  - Would apply Office default theme instead of configured custom template
  - Defeated the purpose of template-based color/font fidelity (v1.2.0)
  - All shapes now automatically get native PPTX during capture with correct template
  - No longer needed - recapturing shapes is the correct way to regenerate native files

### Changed
- Updated error messages to guide users to recapture shapes instead of using removed action
- Cleaner action panel with only essential utilities

## [1.2.1] - 2025-01-31

### Removed
- **"Recreate Library Deck with Current Theme" action**: Removed as unnecessary with template-based approach
  - Library deck now automatically uses configured template on first creation
  - Manual recreation no longer needed
- **"Repair Broken Previews" action**: Removed as preview management is now more robust
  - Preview files are automatically moved when changing categories (added in v1.1.0)
  - Template-based approach prevents theme-related preview issues
  - Action and `Cmd/Ctrl + Shift + R` keyboard shortcut removed

### Changed
- Simplified action panel in Shape Browser for cleaner UX
- Reduced maintenance surface by removing redundant utilities

## [1.2.0] - 2025-01-31

### Added
- **Custom PowerPoint Template Support**: New preference to specify a custom PowerPoint template file
  - Ensures 100% fidelity of company themes, colors, and fonts during shape capture
  - Template is used for all native PPTX generation and library deck creation
  - Accessible via "PowerPoint Template Path" in extension preferences
  - Fully backward compatible - leave empty to use Office default theme
- Color normalization functions for backward compatibility with older shape definitions
  - Automatically adds `#` prefix to hex colors for proper RGB interpretation
  - Prevents theme color misinterpretation in pptxgenjs

### Changed
- **Simplified Native PPTX Generation**: Replaced complex presentation duplication logic with template-based approach
  - More reliable and maintainable code
  - Eliminates issues with slide/shape deletion during capture
  - Significantly improved capture performance
- **Library Deck Creation**: Now uses custom template if configured
  - Ensures consistent theming across entire library
  - Template theme is preserved when adding new shapes to deck
- Updated windowsExtractor.ts to use template-first approach
- Updated deck.ts to use template-first approach

### Fixed
- **Theme Color Preservation**: Fixed issue where Theme Colors (Accent 1, Accent 2, etc.) were converted to Office default colors
  - Previously, shapes lost company branding colors during capture
  - Now maintains exact color fidelity when using custom template
- **Font Formatting Preservation**: Fixed issue where font styles (headers, body text) were changed during capture
  - Custom fonts and text formatting now preserved 100%
- Fixed bug where `library_deck.pptx` was incorrectly created as a directory instead of a file
  - Removed errant newline character in path handling code

### Documentation
- Added comprehensive template configuration guide in README
- Updated feature list to highlight theme fidelity capabilities
- Added step-by-step template setup instructions
- Clarified benefits of using custom templates for corporate environments

## [1.1.0] - 2025-01-28

### Added
- **Repair Broken Previews**: New manual action to fix orphaned preview thumbnails
  - Accessible via keyboard shortcut `Cmd/Ctrl + Shift + R`
  - Automatically finds and moves preview files to correct category folders
  - Shows count of repaired previews with success message
  - Located in Utility section of action menu
- Auto-repair function that scans and fixes misplaced preview files
  - Runs on-demand when user invokes "Repair Broken Previews"
  - Creates marker file to track repair status

### Changed
- **Improved Category Display**: Category names now use "Capitalize Each Word" format instead of ALL CAPS
  - "BASIC SHAPES" → "Basic Shapes"
  - "PROPOSALS" → "Proposals"
  - "VISUALS" → "Visuals"
  - "LEGAL" → "Legal"
  - "NATIVE-ONLY" → "Native-Only"
- Enhanced category change workflow to physically move preview PNG files
  - When editing a shape and changing its category, the preview file is now automatically moved to the new category folder
  - Ensures thumbnails remain correctly linked after category changes

### Fixed
- **Thumbnail Display Bug**: Fixed issue where thumbnails would show as blue squares after changing shape category
  - Preview files are now properly moved when shapes are reassigned to different categories
  - Prevents broken preview paths in shape metadata
- Added fallback copy mechanism when file rename fails across different drives/devices

## [1.0.0] - 2025-01-XX

### Added
- Initial release of PowerPoint Shapes Library
- Visual grid browser with PNG/SVG preview system
- Shape capture from PowerPoint using COM API (Windows)
- Customizable category system with editable names
- Edit and delete shapes functionality
- Multiple shape insertion methods:
  - Direct insertion into active PowerPoint (Windows)
  - Copy to clipboard
  - Open in new PowerPoint file
- Shape library import/export via ZIP files
- Batch preview generation script (Windows only)
- Smart caching system for improved performance
- PPTX library deck for faster shape access
- Auto-cleanup of temporary files
- Cross-platform support (Windows full features, macOS basic support)
- TypeScript implementation with full type safety
- Keyboard shortcuts for all major actions
- Configurable preferences for workflow customization

[1.3.2]: https://github.com/yourusername/shapes-library/compare/v1.3.1...v1.3.2
[1.3.1]: https://github.com/yourusername/shapes-library/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/yourusername/shapes-library/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/yourusername/shapes-library/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/yourusername/shapes-library/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/yourusername/shapes-library/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/yourusername/shapes-library/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yourusername/shapes-library/releases/tag/v1.0.0
