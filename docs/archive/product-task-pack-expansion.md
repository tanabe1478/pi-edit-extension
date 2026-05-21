# Product task pack expansion

## 日本語要約

JSON、Markdown、大きめ repeated file など product task pack 拡張の記録です。


This step adds non-JS and larger-file product tasks to `bench:product`.

## Added base fixture files

- `config/app.json`
- `README.md`
- `src/routes.js` with 40 repeated route entries
- `test/app-config.test.js`
- `test/routes.test.js`

The base suite now has 5 tests.

## Added tasks

### `enable-json-cache`

Edit JSON config and the corresponding test:

- `config/app.json`: `cache.enabled` false -> true
- `test/app-config.test.js`: expected cache setting false -> true

### `document-base-url-option`

Edit Markdown docs only:

- document `createClient` `baseUrl` option
- mention default `https://api.example.com`
- mention request paths are appended

### `update-large-route-entry`

Localized edit in a larger repeated file:

- update only `/route-37` in `src/routes.js`
- method `GET` -> `POST`
- handler `handleRoute37` -> `submitRoute37`
- update `test/routes.test.js`

## Validation commands

```bash
npm run bench:product -- \
  --out /tmp/pi-edit-product-taskpack-enable-json-cache-fixed \
  --modes replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task enable-json-cache \
  --timeout 300

npm run bench:product -- \
  --out /tmp/pi-edit-product-taskpack-document-base-url-option \
  --modes replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task document-base-url-option \
  --timeout 300

npm run bench:product -- \
  --out /tmp/pi-edit-product-taskpack-update-large-route-entry \
  --modes replace_edit_tagged,replace_edit_hashline,replace_edit_hybrid \
  --task update-large-route-entry \
  --timeout 300
```

## Results

### Product success

| task | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | ---: | ---: | ---: |
| `enable-json-cache` | 1/1 | 1/1 | 1/1 |
| `document-base-url-option` | 1/1 | 1/1 | 1/1 |
| `update-large-route-entry` | 1/1 | 1/1 | 1/1 |

### Outcome categories

| task | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | --- | --- | --- |
| `enable-json-cache` | `success_product_only` | `success_product_only` | `success_product_only` |
| `document-base-url-option` | `success_product_only` | `success_product_only` | `success_product_only` |
| `update-large-route-entry` | `success_exact` | `success_exact` | `success_exact` |

### Extension-observed tool I/O chars

| task | replace_edit_tagged | replace_edit_hashline | replace_edit_hybrid |
| --- | ---: | ---: | ---: |
| `enable-json-cache` | 885 | 1931 | 1931 |
| `document-base-url-option` | 541 | 467 | 508 |
| `update-large-route-entry` | 3691 | 3529 | 3529 |

## Notes

The first `enable-json-cache` prompt did not explicitly say to update tests, and all modes changed only JSON. Tests correctly failed. The prompt was clarified to include test updates, and all modes then passed.

The product outcome classifier was also corrected so successful hashline edit calls are not treated as rejection signals. Only explicit metric errors/mismatches/rejections now count as rejection indicators.

## Observations

- The expanded task pack covers JSON, Markdown, and a larger repeated source file.
- All edit replacement modes remained product-correct after prompt clarification.
- `update-large-route-entry` is a useful localized large-file task: all modes achieved exact success.
- Hashline modes were slightly more compact than tagged on the large route edit in extension-observed tool I/O.
