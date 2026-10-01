# trip-map

A password-protected road trip map, hosted on GitHub Pages.

`trail.enc.json` is encrypted with AES-256-GCM, using a key derived from a password with PBKDF2-SHA256. The page decrypts it in the browser, and nothing readable is stored in this repo.

```sh
npm test        # decrypt, format and trip-mode unit tests
npm run serve   # http://localhost:8000
```

`post.html` is the phone's photo uploader (see trip-backend's README). Photos are encrypted with per-photo keys stored inside `photos.enc.json`.

Archived trips live in `trips/<id>/`. Their names and dates are only inside the encrypted `trips.enc.json`. The map opens them with `#trips` (list) and `#trip=<id>` (one trip).
