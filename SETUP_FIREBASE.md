# Configurazione CuddlesInBed

## Architettura della versione attuale
- **GitHub**: contiene solo il codice del progetto.
- **Netlify**: pubblica il sito e custodisce le chiavi private nelle Environment Variables.
- **Firebase Authentication**: login di `cucci` e `cicci`.
- **Cloud Firestore**: calendario, Diario, metadati della Galleria e cataloghi personali.
- **Cloudinary**: file reali di foto e video.
- **TMDB / Open Library / IGDB / Spotify**: cataloghi esterni per TV, libri, videogiochi e musica.

Firebase Storage NON viene usato e NON serve il piano Blaze.

## 1. Firebase Authentication
In Firebase Console > Authentication > Sign-in method abilita **Email/Password**.

In Authentication > Users devono esistere:
- `cucci@cuddles.app` con la password scelta per Cucci.
- `cicci@cuddles.app` con la password scelta per Cicci.

Le email sono identificatori interni; nel sito si inseriscono solo `cucci` o `cicci`.

## 2. Firestore Rules
In Firebase Console > Firestore Database > Rules sostituisci le regole con il contenuto di `firestore.rules` e premi **Pubblica**.

Non devi creare manualmente le raccolte. Il sito crea automaticamente `calendar`, `photos`, `diaryMessages` e i documenti sotto `users/...` quando servono.

## 3. Cloudinary
1. Crea un account Cloudinary e apri la Dashboard del tuo Cloud.
2. Recupera **Cloud name**, **API Key** e **API Secret**.
3. NON mettere API Secret negli HTML e NON caricarlo su GitHub.
4. Su Netlify apri Site configuration > Environment variables e crea:
   - `CLOUDINARY_CLOUD_NAME`
   - `CLOUDINARY_API_KEY`
   - `CLOUDINARY_API_SECRET`
   - `FIREBASE_WEB_API_KEY` = la `apiKey` Firebase già presente nella configurazione web del progetto (è una chiave pubblica, qui serve alla funzione per verificare il login).
5. Avvia un nuovo deploy Netlify.

Le funzioni verificano prima il token Firebase e accettano soltanto `cucci@cuddles.app` e `cicci@cuddles.app`. Gli upload vengono firmati da `netlify/functions/cloudinary-sign.js`; il browser riceve una firma temporanea, non l'API Secret. Le eliminazioni passano da `cloudinary-delete.js`.

Le nuove foto/video vengono salvate in cartelle simili a:
`cuddles-in-bed/2026-08-07/cucci/...`

Firestore conserva soltanto URL, public ID Cloudinary, autore, giorno, descrizione, dimensioni e timestamp.

### Vecchie foto
Al primo accesso la pagina ricostruisce le vecchie foto presenti nel calendario e prova a copiarle automaticamente su Cloudinary. I file locali inclusi nel repository possono essere migrati automaticamente. Per vecchi URL remoti che bloccano CORS, il sito continuerà a mostrare l'URL precedente invece di perdere la foto.

## 4. Catalogo Ciccina TV — TMDB
Su Netlify aggiungi:
- `TMDB_BEARER_TOKEN`

## 5. Videogiochi — IGDB/Twitch
Su Netlify aggiungi:
- `TWITCH_CLIENT_ID`
- `TWITCH_CLIENT_SECRET`

## 6. Musica — Spotify
Su Netlify aggiungi:
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

## 7. Libri — Open Library
Non richiede una chiave API.

## 8. Deploy GitHub → Netlify
Carica/committa questa versione nel repository GitHub collegato a Netlify. Netlify farà il deploy automaticamente. Dopo aver aggiunto o cambiato Environment Variables, esegui un nuovo deploy.

## Importante sulla sicurezza
- Non mettere password, API Secret, token TMDB, Twitch secret o Spotify secret nel repository.
- Se il vecchio token GitHub contenuto nelle prime versioni del progetto non è ancora stato revocato, revocalo.
- Firebase Storage non è più necessario.


## Tema grafico
Tema dark gotico unificato: nero, rosso e viola. Nessun accento giallo, verde o blu nell’interfaccia.
