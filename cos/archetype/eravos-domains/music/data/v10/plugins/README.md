# ERAVOS Plugins

Each `.json` file is one plugin. Add new plugins by dropping a JSON file here with this structure:

```json
{
  "id": "myplugin",
  "name": "MY PLUGIN",
  "icon": "⚡",
  "col": "#ff6b00",
  "tag": "CATEGORY",
  "desc": "What it does.",
  "params": [
    {"n": "Param Name", "v": 0.5}
  ],
  "presets": {
    "DEFAULT": {"0": 0.5}
  }
}
```

Update `_index.json` to include your plugin id, then reload ERAVOS.
