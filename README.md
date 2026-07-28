# Sir James’s Quizbox — Version 4

A mobile-first live multiplayer quiz designed for iPhone and GitHub Pages.

## What is new

- 500 English-language questions
- Six modes: General Knowledge plus five specialist categories
- The General Knowledge mode draws a balanced mix from all five categories
- Every question remains open for the full 20 seconds
- Each player receives a persistent color
- During the reveal, the correct answer is highlighted in green and colored player markers show every choice
- Shared invitation links open the correct room automatically; returning players with a saved name join immediately
- Refined antique-cabinet visual design
- Network-first service worker behavior for faster future updates

## Publish an update

1. Replace the files in the existing local `Quiz` folder with the files from this package.
2. In GitHub Desktop, commit the changed files to `main`.
3. Click **Push origin**.
4. Publish the included `firebase.rules.json` in Firebase Realtime Database → Rules.

The Firebase rules must be updated because Version 4 adds category settings, player colors, and a safer answer format.


## Version 6 fixes
- Fixed invitation URL generation for Share, Copy Link, and QR Code.
- Added a gold British Shorthair crest.
- Updated Firebase rules so authenticated players can save their own answers.
- Publish `firebase.rules.json` in Firebase Realtime Database Rules after updating the files.
