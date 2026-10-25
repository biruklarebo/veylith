import { useNav } from '../nav';
import { useExercises } from '../store';
import { Figure } from '../components/BodyMap';
import { BODY_PARTS } from '../types';

const LEGS = new Set([5, 8, 9]);
const BACK = new Set([1, 5, 7]);

export function Discover() {
  const nav = useNav();
  const exercises = useExercises();
  return (
    <div className="page">
      <header className="home-head">
        <h1 className="title">Discover</h1>
        <button className="icon-btn" onClick={() => nav.push({ kind: 'settings' })} aria-label="Settings">
          ⚙
        </button>
      </header>
      <button className="search fake" onClick={() => nav.push({ kind: 'library' })}>
        ⌕ Search {exercises.length} exercises
      </button>

      <h3 className="section-title">Train by muscle</h3>
      <div className="muscle-grid">
        {BODY_PARTS.map((name, i) => {
          const heat = Array(11).fill(0);
          heat[i] = 1;
          const n = exercises.filter((e) => e.bodyPart === i).length;
          return (
            <button key={name} className="muscle-tile" onClick={() => nav.push({ kind: 'library', part: i })}>
              {i === 10 ? (
                <span className="cardio-ico">♥</span>
              ) : (
                <Figure view={BACK.has(i) ? 'back' : 'front'} crop={LEGS.has(i) ? 'lower' : 'upper'} heat={heat} />
              )}
              <b>{name}</b>
              <span className="muted small">{n} exercises</span>
            </button>
          );
        })}
      </div>

      <h3 className="section-title">Tools</h3>
      <ul className="list">
        <li>
          <button className="list-item" onClick={() => nav.push({ kind: 'bodystats' })}>
            <span className="grow">
              <b>Body stats</b>
              <span className="muted small block">Weight, body fat and measurements</span>
            </span>
            <span className="chev">›</span>
          </button>
        </li>
        <li>
          <button className="list-item" onClick={() => nav.push({ kind: 'library' })}>
            <span className="grow">
              <b>Create a custom exercise</b>
              <span className="muted small block">Add anything missing from the library</span>
            </span>
            <span className="chev">›</span>
          </button>
        </li>
      </ul>
    </div>
  );
}
