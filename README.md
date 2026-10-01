# trip-map

A password-protected road trip map, hosted on GitHub Pages.

`trail.enc.json` is encrypted with AES-256-GCM, using a key derived from a password with PBKDF2-SHA256. The page decrypts it in the browser, and nothing readable is stored in this repo.

```sh
npm test        # decrypt + time unit tests
npm run serve   # http://localhost:8000
```
