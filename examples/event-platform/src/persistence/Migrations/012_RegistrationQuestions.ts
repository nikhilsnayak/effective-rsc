import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE registration_questions (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      description TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('text', 'select')),
      required INTEGER NOT NULL CHECK (required IN (0, 1)),
      options_json TEXT NOT NULL DEFAULT '[]',
      sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
      status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE registration_answers (
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES registration_questions(id) ON DELETE RESTRICT,
      answer TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (order_id, question_id)
    )
  `;

  yield* sql`
    CREATE INDEX registration_questions_event_status_sort_idx
    ON registration_questions (event_id, status, sort_order)
  `;

  yield* sql`
    INSERT INTO registration_questions (
      id,
      event_id,
      label,
      description,
      question_type,
      required,
      options_json,
      sort_order,
      status,
      created_at,
      updated_at
    )
    VALUES
      (
        'question-summit-role',
        'event-effect-systems-summit-2026',
        'What is your role?',
        'Shown to organizers so they can understand the audience.',
        'text',
        1,
        '[]',
        10,
        'active',
        '2026-08-01T00:00:00Z',
        '2026-08-01T00:00:00Z'
      ),
      (
        'question-summit-dietary',
        'event-effect-systems-summit-2026',
        'Dietary preference',
        'Optional information for event catering.',
        'select',
        0,
        '["No preference","Vegetarian","Vegan","Other"]',
        20,
        'active',
        '2026-08-01T00:00:00Z',
        '2026-08-01T00:00:00Z'
      )
  `;
});
