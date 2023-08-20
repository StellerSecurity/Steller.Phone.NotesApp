# Steller.Phone.NotesApp (Steller - Notes)

A hybrid ionic application that allows users to store notes on their phone using localStorage.

It is possible to add a password for the app which encrypts all data stored on the phone with AES256.

For further security, it is also possible to add passwords on any created notes.

All data is stored with localStorage and if any password is set, data will be encrypted with AES256.

Key-features:

* Data only stored on the phone. Not on any server.
* If the app contains a password and it has been unlocked, the app will require the notes app password again after 2 minutes inactivity.
* Possible to delete all notes in one tap.
* If the user loses their notes-password it is possible to reset the password, but it requires to delete all data created, meaning the app will be empty. Data cannot be recovered without the passwords.
* Brute-force protection.
* All data will be wiped/deleted from the phone, if there is 20+ incorrect passwords attempts in a row.
* Password helper, when adding password for the app or notes our password helper will ensure you create a strong password.

Up-coming features:
- Possible to export notes and upload them to a new device. [Requires the decryption keys, if there is any set].
- If a note has a lock, and it has been unlocked - but the user is inactive x time, the app should automaticly unlock the note. If the user has notes app password, it already does for the whole app.

Sources:
The app "Steller - Notes" will be availabile on Aptoide, Fdroid, Google store and Apple store.

Install:

1. NPM install

2. ionic serve

thats it.
