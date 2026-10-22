import { TOPIC_RULES_VERSION, TOPIC_TAXONOMY } from "./topic-catalog.mjs";

// The second cursor pins interpretation, independently of the raw-fact cursor.
// A new analysis must not silently change page two of an existing query.
export function queryAutomaticTopic(store, owner, topicId, options) {
  const upper = Number(store.db.prepare("SELECT COALESCE(MAX(seq),0) AS n FROM topic_analysis_results WHERE owner=?").get(owner).n);
  const analysisThrough = Math.min(options.analysis_through ?? upper, upper);
  const { through, from, until, after = 0, limit = 50 } = options;
  const cte = `WITH ranked AS (
      SELECT r.seq,r.source_event_id,j.revision,ROW_NUMBER() OVER(PARTITION BY r.source_event_id ORDER BY j.revision DESC,r.seq DESC) AS position
      FROM topic_analysis_results r JOIN topic_analysis_jobs j ON j.owner=r.owner AND j.id=r.job_id
      WHERE r.owner=? AND r.seq<=? AND j.source_seq<=? AND j.rules_version=? AND j.taxonomy_sha256=?),
    active AS (SELECT * FROM ranked WHERE position=1),
    questions AS (
      SELECT e.seq,e.body,e.question_id,u.status,r.seq AS result_seq,u.unit_id
      FROM active r JOIN topic_analysis_units u ON u.owner=? AND u.result_seq=r.seq AND u.kind='question'
      JOIN events e ON e.owner=u.owner AND e.event_id=r.source_event_id
      WHERE e.occurred_at>=? AND e.occurred_at<?),
    played AS (
      SELECT e.seq,e.body,e.run_id,e.beat_id,u.step_id,e.delivery_digest,r.seq AS result_seq,u.unit_id,u.status
      FROM active r JOIN events source ON source.owner=? AND source.event_id=r.source_event_id AND source.kind='course_delivered'
      JOIN topic_analysis_units u ON u.owner=source.owner AND u.result_seq=r.seq AND u.kind='beat'
      JOIN events e ON e.owner=source.owner AND e.kind='beat_completed' AND e.seq<=?
        AND e.session_id=source.session_id AND e.course_key=source.course_key AND e.question_id=source.question_id
        AND e.delivery_digest=json_extract(source.body,'$.data.snapshot_sha256') AND e.beat_id=u.beat_id AND json_extract(e.body,'$.data.step_id')=u.step_id
      WHERE e.occurred_at>=? AND e.occurred_at<?),
    tasks AS (
      SELECT e.seq,e.body,e.kind,u.status,r.seq AS result_seq,u.unit_id
      FROM active r JOIN events source ON source.owner=? AND source.event_id=r.source_event_id AND source.kind='course_delivered'
      JOIN topic_analysis_units u ON u.owner=source.owner AND u.result_seq=r.seq AND u.kind='task'
      JOIN events e ON e.owner=source.owner AND e.kind IN ('task_attempt','task_hint') AND e.seq<=?
        AND e.session_id=source.session_id AND e.course_key=source.course_key AND e.question_id=source.question_id
        AND e.delivery_digest=json_extract(source.body,'$.data.snapshot_sha256')
        AND json_extract(e.body,'$.data.source_task_id')=json_extract(CASE WHEN json_valid(u.unit_id) THEN u.unit_id ELSE '[]' END,'$[1]')
      WHERE e.occurred_at>=? AND e.occurred_at<?),
    matched AS (
      SELECT q.seq,q.body,q.result_seq,q.unit_id,l.quote FROM questions q JOIN topic_analysis_links l ON l.owner=? AND l.result_seq=q.result_seq AND l.unit_id=q.unit_id AND l.topic_id=?
      UNION
      SELECT p.seq,p.body,p.result_seq,p.unit_id,l.quote FROM played p JOIN topic_analysis_links l ON l.owner=? AND l.result_seq=p.result_seq AND l.unit_id=p.unit_id AND l.topic_id=?
      UNION
      SELECT t.seq,t.body,t.result_seq,t.unit_id,l.quote FROM tasks t JOIN topic_analysis_links l ON l.owner=? AND l.result_seq=t.result_seq AND l.unit_id=t.unit_id AND l.topic_id=?)`;
  const args = [owner, analysisThrough, through, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, owner, from, until,
    owner, through, from, until, owner, through, from, until, owner, topicId, owner, topicId, owner, topicId];
  const stats = store.db.prepare(`${cte} SELECT
    (SELECT COUNT(*) FROM questions) AS analyzed_questions,
    (SELECT COUNT(*) FROM questions WHERE status='mapped') AS mapped_questions,
    (SELECT COUNT(*) FROM questions WHERE status='unknown') AS unknown_questions,
    (SELECT COUNT(*) FROM questions WHERE status='outside-catalog') AS outside_catalog_questions,
    (SELECT COUNT(DISTINCT question_id) FROM questions WHERE seq IN (SELECT seq FROM matched)) AS question_count,
    (SELECT COUNT(DISTINCT run_id) FROM played WHERE seq IN (SELECT seq FROM matched)) AS played_runs,
    (SELECT COUNT(DISTINCT json_array(run_id,step_id,beat_id,delivery_digest)) FROM played WHERE seq IN (SELECT seq FROM matched)) AS played_beats,
    (SELECT COUNT(DISTINCT json_array(run_id,step_id,beat_id,delivery_digest)) FROM played WHERE status='mapped') AS associated_played_beats,
    (SELECT COUNT(DISTINCT json_array(run_id,step_id,beat_id,delivery_digest)) FROM played) AS analyzed_played_beats,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_attempt') AS analyzed_attempts,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_attempt' AND status='mapped') AS associated_attempts,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_hint' AND status='mapped') AS associated_hints,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_attempt' AND seq IN (SELECT seq FROM matched)) AS task_attempts,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_attempt' AND json_extract(body,'$.data.result')='succeeded' AND seq IN (SELECT seq FROM matched)) AS task_successes,
    (SELECT COUNT(DISTINCT seq) FROM tasks WHERE kind='task_hint' AND seq IN (SELECT seq FROM matched)) AS task_hints`).get(...args);
  const total = store.db.prepare(`SELECT COUNT(CASE WHEN kind='question_submitted' THEN 1 END) AS questions,
      COUNT(DISTINCT CASE WHEN kind='beat_completed' AND json_extract(course_key,'$[0]')='generated' THEN json_array(run_id,json_extract(body,'$.data.step_id'),beat_id,delivery_digest) END) AS played_beats,
      COUNT(CASE WHEN kind='task_attempt' AND json_extract(course_key,'$[0]')='generated' THEN 1 END) AS task_attempts
      FROM events WHERE owner=? AND seq<=? AND occurred_at>=? AND occurred_at<?`).get(owner, through, from, until);
  const rows = store.db.prepare(`${cte} SELECT seq,body,json_group_array(json_object('result_seq',result_seq,'unit_id',unit_id,'quote',quote)) AS associations
    FROM matched WHERE seq>? GROUP BY seq ORDER BY seq LIMIT ?`).all(...args, after, limit + 1);
  const page = rows.slice(0, limit);
  const unresolved = Math.max(0, total.questions - stats.analyzed_questions) + stats.unknown_questions + Math.max(0, total.played_beats - stats.associated_played_beats) + Math.max(0, total.task_attempts - stats.associated_attempts);
  return { taxonomy: TOPIC_TAXONOMY, rules_version: TOPIC_RULES_VERSION, analysis_through: analysisThrough,
    status: !stats.analyzed_questions && !stats.analyzed_played_beats && !stats.analyzed_attempts ? "not-analyzed" : unresolved ? "partial" : "associated",
    meaning: "counts-from-associated-records-only; playback-is-not-mastery",
    counts: { question_count: stats.mapped_questions ? stats.question_count : null,
      played_runs: stats.associated_played_beats ? stats.played_runs : null, played_beats: stats.associated_played_beats ? stats.played_beats : null,
      task_attempts: stats.associated_attempts ? stats.task_attempts : null, task_successes: stats.associated_attempts ? stats.task_successes : null,
      task_hints: stats.associated_hints ? stats.task_hints : null },
    coverage: { total_questions: total.questions, analyzed_questions: stats.analyzed_questions, unknown_questions: stats.unknown_questions,
      outside_catalog_questions: stats.outside_catalog_questions, unprocessed_questions: Math.max(0, total.questions - stats.analyzed_questions),
      generated_played_beats: total.played_beats, analyzed_played_beats: stats.analyzed_played_beats, associated_played_beats: stats.associated_played_beats,
      unassociated_played_beats: Math.max(0, total.played_beats - stats.associated_played_beats),
      generated_task_attempts: total.task_attempts, analyzed_task_attempts: stats.analyzed_attempts,
      associated_task_attempts: stats.associated_attempts, unassociated_task_attempts: Math.max(0, total.task_attempts - stats.associated_attempts) },
    events: page.map(row => ({ seq: row.seq, event: JSON.parse(row.body), associations: JSON.parse(row.associations) })),
    next_after: rows.length > limit ? page.at(-1).seq : null };
}

// Topics found in this run's submitted/delivered material. This is discovery
// for the inspection panel, not proof that any generated content was played.
export function automaticTopicsForRun(store, owner, runId, through) {
  const rows = store.db.prepare(`WITH ranked AS (
    SELECT r.seq,ROW_NUMBER() OVER(PARTITION BY r.source_event_id ORDER BY j.revision DESC,r.seq DESC) AS position
    FROM topic_analysis_results r JOIN topic_analysis_jobs j ON j.owner=r.owner AND j.id=r.job_id
    WHERE r.owner=? AND r.run_id=? AND j.source_seq<=? AND j.rules_version=? AND j.taxonomy_sha256=?)
    SELECT DISTINCT l.topic_id FROM ranked r JOIN topic_analysis_links l ON l.owner=? AND l.result_seq=r.seq
    WHERE r.position=1 ORDER BY l.topic_id`).all(owner, runId, through, TOPIC_RULES_VERSION, TOPIC_TAXONOMY.catalog_sha256, owner);
  return rows.map(row => row.topic_id);
}
