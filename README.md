# VSCode format in context menus

This VSCode extension allows the user to run actions (such as format, organize imports) on one or multiple files from the context menu.

![Demo](https://github.com/normansreed/vscode-context-menu-actions/blob/master/assets/demo.gif?raw=true)

## Features

- Run actions on one or multiple files from Explorer Context Menu
- Run actions on one or multiple files from SCM Context Menu
- Run actions on one file from Editor File Tile Context Menu

## Extension Settings

This extension contributes the following settings:

- `contextMenuActions.save`: enable/disable saving after applying actions (default: `true`).
- `contextMenuActions.close`: enable/disable closing closing after saving (default: `false`). This does nothing unless you have enabled saving after formatting.
- `contextMenuActions.actions`: a list of vscode actions to run for each file. Default:

```JSON
  [
    "editor.action.organizeImports",
    "editor.action.formatDocument"
  ]
```

**WARNING**: While `contextMenuActions` _technically_ supports any editor/workspace action in VSCode, it is only tested for organize imports and formatting the document. Use other values at your own risk!

## Credits

Forked from [Format in context menus](https://github.com/lacroixdavid1/vscode-format-context-menu)
