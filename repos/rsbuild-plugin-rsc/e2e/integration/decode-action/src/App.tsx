'use server-entry';

import { submitMessage } from './actions.ts';
import './App.css';
import { getSubmittedMessage } from './state.ts';

export function App() {
  return (
    <html lang="en">
      <head>
        <title>decodeAction without JavaScript</title>
      </head>
      <body>
        <main>
          <h1>decodeAction without JavaScript</h1>
          <p data-testid="submitted-message">{getSubmittedMessage()}</p>
          <form action={submitMessage}>
            <label htmlFor="message">Message</label>
            <input id="message" name="message" required />
            <button type="submit">Submit without JavaScript</button>
          </form>
        </main>
      </body>
    </html>
  );
}
