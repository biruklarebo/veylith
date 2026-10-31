import essentials3x from './essentials-3x.csv?raw';
import fundamentals5x from './fundamentals-5x.csv?raw';
import redditPpl6x from './reddit-ppl-6x.csv?raw';
import minMax4x from './min-max-4x.csv?raw';

// Curated programs that ship with the app, in the spreadsheet format the importer reads.
// `since` is the store version that first ships the program, so the migration adds it once.
export const SEED_PROGRAMS = [
  { id: 'my-split-essentials', name: 'Essentials 3x', csv: essentials3x, since: 2 },
  { id: 'fundamentals-5x', name: 'Fundamentals 5x', csv: fundamentals5x, since: 3 },
  { id: 'reddit-ppl-6x', name: 'Reddit PPL 6x', csv: redditPpl6x, since: 4 },
  { id: 'min-max-4x', name: 'Minimize Maximize 4x', csv: minMax4x, since: 5 },
];
