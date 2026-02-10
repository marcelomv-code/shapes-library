# PowerPoint Shapes Library - Raycast Extension

Browse and insert editable PowerPoint shapes into your presentations with ease. Build a personal library of reusable shapes and access them instantly with Raycast.

## Features

### Browse & Insert Shapes
- **Visual Grid Browser**: Browse shapes with high-quality PNG thumbnail previews
- **Customizable Categories**: Organize shapes into categories with custom names (managed via "Manage Categories" command)
- **Search & Filter**: Quickly find shapes by name, tags, or category
- **100% Editable**: Shapes remain fully editable vectors in PowerPoint
- **Multiple Insert Methods**:
  - Direct insertion into active PowerPoint (Windows)
  - Copy to clipboard
  - Open in new PowerPoint file
- **Edit & Delete**: Update shape metadata or remove shapes from library
- **Smart Preview System**: PNG previews with SVG fallback for instant display

### Capture Shapes
- **Extract from PowerPoint**: Capture any shape from existing presentations
- **Auto-Detection**: Automatically detects shape type and suggests tags
- **Preserve Properties**: Maintains colors, sizes, formatting, and all visual properties
- **100% Theme Fidelity**: Use custom PowerPoint templates to preserve company themes, colors, and fonts
- **Build Your Library**: Save captured shapes for instant reuse
- **Automatic PNG Preview**: Generates high-quality preview images on capture
- **Native PPTX Storage**: Stores original PPTX files for 100% fidelity

### Shape Management
- **Edit Shapes**: Change name, category, and tags
- **Move Between Categories**: Reorganize your library by changing shape categories (preview files move automatically)
- **Delete Shapes**: Remove unwanted shapes with confirmation
- **Batch Preview Generation**: Regenerate previews for entire categories (Windows)
- **Library Import/Export**: Share shape libraries via ZIP files

## How It Works

### Using Shapes from Library
1. Open Raycast and search for "Search Shapes"
2. Browse or search for the shape you want
3. Press Enter to open the shape in PowerPoint
4. Copy the shape in PowerPoint (Ctrl+C)
5. Paste into your presentation - the shape is fully editable!

### Capturing Shapes
1. Open PowerPoint with your presentation
2. Select a shape you want to capture
3. Open Raycast and search for "Capture Shape from PowerPoint"
4. Press Enter and customize the shape details
5. Save to library - now it's available in "Search Shapes"!

## Keyboard Shortcuts

### In Shape Browser
- **Enter**: Insert shape into active PowerPoint or open in PowerPoint
- **Ctrl + C**: Copy shape to clipboard
- **Ctrl + O**: Open shape in PowerPoint (new window)
- **Ctrl + E**: Edit shape (name, category, tags)
- **Ctrl + M**: Open Manage Categories
- **Ctrl + X**: Delete shape from library
- **Ctrl + R**: Refresh shape library
- **Ctrl + I**: Copy preview image to clipboard
- **Ctrl + F**: Show shape file in File Explorer

### In Manage Categories
- **Enter**: Rename selected category
- **Ctrl + N**: Add new category
- **Ctrl + O**: Open Shape Picker filtered by selected category
- **Ctrl + X**: Delete category (only if empty)

### In Shape Capture
- **Ctrl + S**: Save captured shape to library
- **Esc**: Cancel capture

## Requirements

- PowerPoint must be installed on your system
- Works with Office 365, Office 2021, Office 2019, and Office 2016

## Technical Details

The extension generates temporary `.pptx` files containing the selected shape, which are automatically opened in PowerPoint. The temporary files are automatically cleaned up after 60 seconds (configurable in preferences).

Shapes are stored as JSON definitions compatible with PptxGenJS, ensuring they maintain full vector editability in PowerPoint.

## Configuration

Access preferences through Raycast Settings → Extensions → PowerPoint Shapes Library:

- **PowerPoint Template Path**: **[RECOMMENDED]** Path to a PPTX template with your company theme. This ensures all captured shapes preserve your company's colors, fonts, and branding. Leave empty to use Office default theme.
  - Example: `C:\Users\YourName\Documents\CompanyTemplate.pptx`
  - Create a template by saving any PowerPoint with your company theme
- **Enable Cache**: Cache shape definitions for faster loading (default: enabled)
- **Auto Cleanup Temp Files**: Delete temporary PowerPoint files after 60 seconds (default: enabled)
- **Library Folder**: Custom location for storing shapes (leave empty for default app data directory)
- **Auto-save after capture**: Skip the form and save immediately after capture (default: disabled)
- **Force Exact Shapes Only**: Require native PPTX files for 100% fidelity (default: enabled)
- **Use PPTX Library Deck**: Store all shapes in a single PPTX deck for faster access (default: enabled)
- **Skip native PPTX save at capture**: Faster capture by skipping native file save (default: enabled)

### Using a Custom PowerPoint Template (Recommended for Corporate Use)

To ensure all captured shapes maintain your company's branding (colors, fonts, theme):

1. **Create a Template**:
   - Open PowerPoint with your company theme/template
   - Save it to a permanent location (e.g., `C:\Users\YourName\Documents\CompanyTemplate.pptx`)

2. **Configure the Extension**:
   - Open Raycast → Extensions → PowerPoint Shapes Library → Preferences
   - Set **PowerPoint Template Path** to your template file path
   - Example: `C:\Users\YourName\Documents\CompanyTemplate.pptx`

3. **Benefits**:
   - ✅ **100% Color Fidelity**: Theme colors (Accent 1, Accent 2, etc.) are preserved exactly
   - ✅ **Font Preservation**: Headers, body text, and all fonts maintain formatting
   - ✅ **Brand Consistency**: All shapes use your company's visual identity
   - ✅ **Automatic Application**: Template is used for all captures and library operations

**Without a template**, shapes will use Office's default theme, which may change colors and fonts.

### Managing Categories

Categories can be fully customized using the **Manage Categories** command:

1. Open Raycast and search for "Manage Categories"
2. Or press `Ctrl+M` from the Shape Picker

**Available actions:**
- **Add New Category**: Create categories with custom names and IDs
- **Rename Category**: Change the display name of any category
- **Delete Category**: Remove empty categories (categories with shapes cannot be deleted)

Categories are stored in `{LibraryRoot}/categories.json` and persist across sessions.

## Development

### Getting Started

```bash
# Clone the repository
git clone https://github.com/yourusername/shapeslibrary.git
cd shapeslibrary

# Install dependencies
npm install

# Start development mode
npm run dev

# Build for production
npm run build

# Lint and fix code
npm run lint
npm run fix-lint
```

### Project Structure

```
shapeslibrary/
├── src/
│   ├── shape-picker.tsx          # Main search and browse interface
│   ├── capture-shape.tsx         # Shape capture from PowerPoint
│   ├── manage-categories.tsx     # Category management UI
│   ├── generator/
│   │   └── pptxGenerator.ts      # PowerPoint file generation
│   ├── types/
│   │   └── shapes.ts             # TypeScript type definitions
│   └── utils/
│       ├── cache.ts              # Shape caching logic
│       ├── categoryManager.ts    # Dynamic category management
│       ├── deck.ts               # PPTX deck management
│       ├── paths.ts              # File path utilities
│       ├── previewGenerator.ts   # PNG preview generation (Windows)
│       ├── shapeSaver.ts         # Shape persistence
│       └── svgPreview.ts         # SVG preview generation
├── assets/                       # Shape preview images (organized by category)
├── native/                       # Native PPTX files for exact shapes
├── scripts/
│   └── batch-generate-previews.ps1  # Batch preview generation (Windows)
└── package.json
```

### Generating Previews (Windows Only)

Generate high-quality PNG previews for all shapes:

```bash
npm run generate-previews
```

Or use the PowerShell script directly:

```powershell
.\scripts\batch-generate-previews.ps1
```

### Technical Details

**Shape Storage**: Shapes are stored as JSON files in category-specific directories (`shapes/basic/`, `shapes/arrows/`, etc.). Each shape JSON contains metadata, PptxGenJS definition, and references to preview files.

**Preview System**: Dual-mode preview system:
1. **PNG Previews** (High Quality): Generated using PowerPoint COM API on Windows
2. **SVG Previews** (Instant Fallback): Generated on-the-fly for basic shapes

**Platform Support**:
- **Windows**: Full support including direct insertion via COM API
- **macOS**: Search, browse, and open shapes (manual paste required)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Author

Arthur Andrade

## Changelog

### Version 1.3.3
- 🔧 **Thumbnail display**: Fixed issue where PNG previews were not loading on Raycast Windows v0.44+. The fix converts Windows file paths to `file:///` URLs with forward slashes, which is now required by Raycast.

### Version 1.3.2
- 🚀 **Initial tracked version**: Full shape capture and library management features
