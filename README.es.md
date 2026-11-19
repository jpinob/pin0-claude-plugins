# pin0-claude-plugins

[English](README.md) · **Español**

Mods y plugins para [Claude Code](https://code.claude.com) que uso a diario y he decidido compartir. Cada uno tiene su carpeta dentro de `plugins/`, con su propio README.

## Qué hay

| Plugin | Qué hace |
| --- | --- |
| [consejero-modelo](plugins/consejero-modelo) | Mientras escribes el primer prompt de una sesión, una línea encima del prompt te sugiere modelo y effort. En cualquier prompt, `Mejorar` pide a un modelo una versión mejor y te la enseña en un panel, con etiquetas para lo que solo tú puedes contestar. Habla español o inglés, según tu borrador. |

## Instalar un plugin

Escribe esto en el prompt de Claude Code, con el nombre del plugin:

```text
/plugin install consejero-modelo --marketplace jpinob/pin0-claude-plugins
```

Contesta `y` para añadir el marketplace y elige un ámbito. Con el marketplace ya añadido, el resto de plugins de aquí se instalan igual.

Son mods: dibujan en la propia interfaz de Claude Code (bandas, paneles, la caja del prompt). Están hechos y probados con Claude Code 2.1.328. La API de mods está en acceso anticipado, así que una versión más nueva puede romper algo.

## Licencia

[MIT](LICENSE).
