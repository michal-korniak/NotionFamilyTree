import type { Gender, PeopleById } from '../types/person';
import { countOf } from './plural';
import { relationLabel } from './relationColors';

export type RelationshipKind = 'self' | 'blood' | 'spouse' | 'affinity' | 'distant';

export interface Relationship {
  kind: RelationshipKind;
  // How the target is related to the reference person, e.g. "Kuzynka" (target is the reference's cousin).
  label: string;
  // Degree as Polish civil law counts it; for affinity, the degree of kinship to the spouse.
  degree?: number;
  // For a label naming the target through another relative ("Mąż ciotki", "Partnerka syna brata ciotecznego"): the index of the word
  // naming the relative closest to the reference person, where "twojego"/"twojej" goes ("Mąż twojej ciotki").
  ownerWord?: number;
  // Everyone on the connecting chains from the reference person to the target, both included: with several equally close common
  // ancestors (both parents of full siblings, both grandparents of cousins) every one of them and their chains are listed.
  path: string[];
}

interface AncestorStep {
  distance: number;
  // The next person on the way back down to the start.
  towardStart: string | null;
}

// Every ancestor of a person (and the person at distance 0), with the shortest number of generations up and how to walk back.
function ancestorsOf(people: PeopleById, id: string): Map<string, AncestorStep> {
  const result = new Map<string, AncestorStep>([[id, { distance: 0, towardStart: null }]]);
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    const { distance } = result.get(current)!;
    for (const parent of people.get(current)?.parents ?? []) {
      if (!people.has(parent) || result.has(parent)) continue;
      result.set(parent, { distance: distance + 1, towardStart: current });
      queue.push(parent);
    }
  }
  return result;
}

function chainDown(ancestors: Map<string, AncestorStep>, from: string): string[] {
  const chain = [from];
  for (let step = ancestors.get(from)!.towardStart; step; step = ancestors.get(step)!.towardStart) chain.push(step);
  return chain;
}

interface BloodLink {
  up: number;
  down: number;
  // One chain a → common ancestor → b, so path[up] is the common ancestor; labels read the people along it.
  path: string[];
  // Everyone on all equally short chains (e.g. through both parents of full siblings).
  members: string[];
}

// The closest common ancestor gives the generations up from a and down to b; up + down is the degree of consanguinity.
function bloodLink(people: PeopleById, a: string, b: string): BloodLink | null {
  const fromA = ancestorsOf(people, a);
  const fromB = ancestorsOf(people, b);
  const closest: { ancestor: string; up: number; down: number }[] = [];
  for (const [ancestor, stepA] of fromA) {
    const stepB = fromB.get(ancestor);
    if (!stepB) continue;
    const degree = stepA.distance + stepB.distance;
    const bestDegree = closest[0] ? closest[0].up + closest[0].down : Infinity;
    if (degree < bestDegree) closest.length = 0;
    if (degree <= bestDegree) closest.push({ ancestor, up: stepA.distance, down: stepB.distance });
  }
  const best = closest[0];
  if (!best) return null;
  // chainDown gives [ancestor, …, start]; a chain runs a → common ancestor → b.
  const chainThrough = (ancestor: string) => [...chainDown(fromA, ancestor).reverse(), ...chainDown(fromB, ancestor).slice(1)];
  const members = [...new Set(closest.flatMap((c) => chainThrough(c.ancestor)))];
  return { up: best.up, down: best.down, path: chainThrough(best.ancestor), members };
}

const byGender = (gender: Gender, male: string, female: string, neutral: string) => (gender === 'M' ? male : gender === 'F' ? female : neutral);

function greatPrefix(levels: number): string {
  return 'pra'.repeat(Math.max(0, levels));
}

// Labels mark with "~" the word naming the relative closest to the reference person ("Mąż ~ciotki"); relationship() turns the mark into ownerWord.
const OWNER = '~';

// A cousin's family branch is named after the uncle or aunt in between: cioteczny through an aunt, stryjeczny through the father's brother, wujeczny through the mother's brother.
function cousinSide(parentSide: Gender, auntOrUncle: Gender): string | null {
  return auntOrUncle === 'F' ? 'cioteczn' : auntOrUncle === 'M' && parentSide === 'M' ? 'stryjeczn' : auntOrUncle === 'M' && parentSide === 'F' ? 'wujeczn' : null;
}

function cousinLabel(parentSide: Gender, auntOrUncle: Gender, target: Gender): string {
  const side = cousinSide(parentSide, auntOrUncle);
  return side ? byGender(target, `Brat ${side}y`, `Siostra ${side}a`, `Rodzeństwo ${side}e`) : byGender(target, 'Kuzyn', 'Kuzynka', 'Kuzynostwo');
}

// A cousin's child is a nephew or niece of that branch, named after the cousin like a sibling's child: bratanek through a male cousin, siostrzeniec through a female one.
function cousinsChildLabel(parentSide: Gender, auntOrUncle: Gender, cousin: Gender, target: Gender): string {
  const side = cousinSide(parentSide, auntOrUncle);
  if (side && cousin === 'M') return byGender(target, `Bratanek ${side}y`, `Bratanica ${side}a`, `Dziecko ${OWNER}brata ${side}ego`);
  if (side && cousin === 'F') return byGender(target, `Siostrzeniec ${side}y`, `Siostrzenica ${side}a`, `Dziecko ${OWNER}siostry ${side}ej`);
  return `${byGender(target, 'Syn', 'Córka', 'Dziecko')} ${cousin === 'F' ? `${OWNER}kuzynki` : `${OWNER}kuzyna`}`;
}

const GENITIVE_NOUNS: Record<string, string> = {
  ojciec: 'ojca', matka: 'matki', rodzic: 'rodzica', dziadek: 'dziadka', babcia: 'babci', syn: 'syna', 'córka': 'córki', dziecko: 'dziecka', wnuk: 'wnuka', wnuczka: 'wnuczki',
  brat: 'brata', siostra: 'siostry', 'rodzeństwo': 'rodzeństwa', siostrzeniec: 'siostrzeńca', siostrzenica: 'siostrzenicy', bratanek: 'bratanka', bratanica: 'bratanicy',
  wuj: 'wuja', stryj: 'stryja', ciotka: 'ciotki', kuzyn: 'kuzyna', kuzynka: 'kuzynki', kuzynostwo: 'kuzynostwa', krewny: 'krewnego', krewna: 'krewnej',
};
const GENITIVE_ADJECTIVES: Record<string, string> = { y: 'ego', a: 'ej', e: 'ego' };

// "Syn ~brata ciotecznego" → "syna ~brata ciotecznego": the head noun and the adjective right after it change; the rest of a label is
// already in the genitive. Null for a label this cannot inflect (e.g. "dziadek lub babcia"), so the caller falls back to a plain term.
function genitive(label: string): string | null {
  const words = label.split(' ');
  if (words.includes('lub')) return null;
  const [head, ...rest] = words as [string, ...string[]];
  const owner = head.startsWith(OWNER) ? OWNER : '';
  const [, prefix = '', noun = ''] = /^((?:pra)*)(.+)$/i.exec(head.replace(OWNER, '').toLowerCase()) ?? [];
  const inflected = GENITIVE_NOUNS[noun];
  if (!inflected) return null;
  const adjective = rest[0] && /^(cioteczn|stryjeczn|wujeczn)[yae]$/.test(rest[0]) ? rest[0].slice(0, -1) + GENITIVE_ADJECTIVES[rest[0].slice(-1)]! : undefined;
  return [`${owner}${prefix}${inflected}`, ...(adjective ? [adjective, ...rest.slice(1)] : rest)].join(' ');
}

function bloodLabel(people: PeopleById, link: BloodLink, target: Gender): string {
  const { up, down, path } = link;
  const via = (index: number) => people.get(path[index]!)?.gender ?? 'U';
  if (down === 0) {
    if (up === 1) return byGender(target, 'Ojciec', 'Matka', 'Rodzic');
    return byGender(target, `${greatPrefix(up - 2)}dziadek`, `${greatPrefix(up - 2)}babcia`, `${greatPrefix(up - 2)}dziadek lub ${greatPrefix(up - 2)}babcia`);
  }
  if (up === 0) {
    if (down === 1) return byGender(target, 'Syn', 'Córka', 'Dziecko');
    return byGender(target, `${greatPrefix(down - 2)}wnuk`, `${greatPrefix(down - 2)}wnuczka`, `${greatPrefix(down - 2)}wnuk lub ${greatPrefix(down - 2)}wnuczka`);
  }
  if (up === 1 && down === 1) return byGender(target, 'Brat', 'Siostra', 'Rodzeństwo');
  // path[up] is the common ancestor; path[up + 1] is the sibling through whom a niece or nephew descends.
  if (up === 1 && down === 2) return via(up + 1) === 'F' ? byGender(target, 'Siostrzeniec', 'Siostrzenica', `Dziecko ${OWNER}siostry`) : byGender(target, 'Bratanek', 'Bratanica', `Dziecko ${OWNER}brata`);
  // path[1] is the parent through whom an uncle or aunt is related: stryj on the father's side, wuj on the mother's.
  if (up === 2 && down === 1) return target === 'F' ? 'Ciotka' : via(1) === 'F' ? byGender(target, 'Wuj', 'Ciotka', 'Wujostwo') : byGender(target, 'Stryj', 'Ciotka', 'Stryjostwo');
  // path[1] is the parent and path[3] the uncle or aunt a first cousin descends through.
  if (up === 2 && down === 2) return cousinLabel(via(1), via(3), target);
  if (up === 3 && down === 1) return `${byGender(target, 'Brat', 'Siostra', 'Rodzeństwo')} ${OWNER}${via(2) === 'F' ? 'babci' : 'dziadka'}`;
  if (up === 2 && down === 3) return cousinsChildLabel(via(1), via(3), via(4), target);
  if (up === 3 && down === 2) return `${byGender(target, 'Kuzyn', 'Kuzynka', 'Kuzynostwo')} ${OWNER}${via(1) === 'F' ? 'matki' : 'ojca'}`;
  if (up === 3 && down === 3) return byGender(target, 'Kuzyn drugiego stopnia', 'Kuzynka drugiego stopnia', 'Kuzynostwo drugiego stopnia');
  return byGender(target, 'Krewny', 'Krewna', 'Krewny');
}

// Relatives of the reference's spouse, seen from the reference (link runs spouse → target).
function spousesRelativeLabel(link: BloodLink, target: Gender): string {
  const { up, down } = link;
  if (up === 1 && down === 0) return byGender(target, 'Teść', 'Teściowa', 'Teść lub teściowa');
  if (up === 0 && down === 1) return byGender(target, 'Pasierb', 'Pasierbica', 'Pasierb lub pasierbica');
  if (up === 1 && down === 1) return byGender(target, 'Szwagier', 'Szwagierka', 'Szwagier lub szwagierka');
  if (up === 2 && down === 0) return `${byGender(target, 'Dziadek', 'Babcia', 'Dziadek lub babcia')} ${OWNER}małżonka`;
  return byGender(target, 'Powinowaty', 'Powinowata', 'Powinowaty');
}

// Partners of the reference's blood relatives (link runs reference → the relative). Married in-laws keep their own names (Synowa,
// Szwagier, Mąż ciotki); anyone else is named through the relative and the kind of union: "Partnerka syna twojego brata ciotecznego".
function relativesPartnerLabel(people: PeopleById, link: BloodLink, target: Gender, unionKind: string | undefined): string {
  const { up, down } = link;
  const married = !unionKind || unionKind === 'Małżeństwo' || unionKind === 'Nieznany';
  if (married) {
    if (up === 0 && down === 1) return byGender(target, 'Zięć', 'Synowa', 'Zięć lub synowa');
    if (up === 1 && down === 0) return byGender(target, 'Ojczym', 'Macocha', 'Ojczym lub macocha');
    if (up === 1 && down === 1) return byGender(target, 'Szwagier', 'Szwagierka', 'Szwagier lub szwagierka');
  }
  const relative = people.get(link.path[link.path.length - 1]!)?.gender ?? 'U';
  const relativeLabel = bloodLabel(people, link, relative);
  const relativeGenitive = genitive(relativeLabel.includes(OWNER) ? relativeLabel : OWNER + relativeLabel);
  if (!relativeGenitive) return byGender(target, 'Powinowaty', 'Powinowata', 'Powinowaty');
  return `${relationLabel('spouse', target, unionKind)} ${relativeGenitive}`;
}

// Any chain of family links (parents, children, spouses), for people connected only through several marriages.
function anyPath(people: PeopleById, from: string, to: string): string[] | null {
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === to) break;
    const person = people.get(current)!;
    for (const next of [...person.parents, ...person.children, ...person.spouses]) {
      if (!people.has(next) || previous.has(next)) continue;
      previous.set(next, current);
      queue.push(next);
    }
  }
  if (!previous.has(to)) return null;
  const path: string[] = [];
  for (let step: string | null = to; step; step = previous.get(step) ?? null) path.unshift(step);
  return path;
}

// unionKind is the Notion union type of the pair, so an engaged couple reads "Narzeczona" rather than "Żona".
export function relationship(people: PeopleById, referenceId: string, targetId: string, unionKind?: (a: string, b: string) => string | undefined): Relationship | null {
  const result = findRelationship(people, referenceId, targetId, unionKind);
  if (!result) return null;
  const ownerWord = result.label.split(' ').findIndex((word) => word.startsWith(OWNER));
  const label = result.label.replace(OWNER, '');
  return { ...result, label: label.charAt(0).toUpperCase() + label.slice(1), ...(ownerWord > 0 ? { ownerWord } : {}) };
}

function findRelationship(people: PeopleById, referenceId: string, targetId: string, unionKind?: (a: string, b: string) => string | undefined): Relationship | null {
  const reference = people.get(referenceId);
  const target = people.get(targetId);
  if (!reference || !target) return null;
  if (referenceId === targetId) return { kind: 'self', label: 'Ja', path: [referenceId] };
  if (reference.spouses.includes(targetId)) {
    return { kind: 'spouse', label: relationLabel('spouse', target.gender, unionKind?.(referenceId, targetId)), path: [referenceId, targetId] };
  }

  const blood = bloodLink(people, referenceId, targetId);
  if (blood) return { kind: 'blood', label: bloodLabel(people, blood, target.gender), degree: blood.up + blood.down, path: blood.members };

  let best: Relationship | null = null;
  const consider = (candidate: Relationship) => { if (!best || candidate.degree! < best.degree!) best = candidate; };
  for (const spouse of reference.spouses) {
    const link = people.has(spouse) ? bloodLink(people, spouse, targetId) : null;
    if (link) consider({ kind: 'affinity', label: spousesRelativeLabel(link, target.gender), degree: link.up + link.down, path: [referenceId, ...link.members] });
  }
  for (const spouse of target.spouses) {
    const link = people.has(spouse) ? bloodLink(people, referenceId, spouse) : null;
    if (link) consider({ kind: 'affinity', label: relativesPartnerLabel(people, link, target.gender, unionKind?.(spouse, targetId)), degree: link.up + link.down, path: [...link.members, targetId] });
  }
  if (best) return best;

  const path = anyPath(people, referenceId, targetId);
  return path ? { kind: 'distant', label: 'Dalsza rodzina', path } : null;
}

export function describeRelationship(rel: Relationship): string {
  if (rel.kind === 'blood' && rel.degree) return `${rel.label} · ${rel.degree}. stopień pokrewieństwa`;
  if (rel.kind === 'affinity' && rel.degree !== undefined) return `${rel.label} · ${rel.degree}. stopień powinowactwa`;
  if (rel.kind === 'distant') return `${rel.label} · przez ${countOf(rel.path.length - 2, 'osobę', 'osoby', 'osób')}`;
  return rel.label;
}

// "Twoja babcia", "Twój kuzyn", "Twoje rodzeństwo": the pronoun agrees with the label's first word, whose ending gives its grammatical gender
// for every label this module produces (-a feminine, -o/-e neuter, otherwise masculine). A label naming someone through another relative
// takes the pronoun on that relative, in the genitive: feminine nouns end in -i/-y/-j there ("Mąż twojej ciotki"), the rest take "twojego".
export function describeRelationshipToMe(rel: Relationship): string {
  const words = rel.label.split(' ');
  if (rel.ownerWord !== undefined) {
    const owner = words[rel.ownerWord]!;
    words.splice(rel.ownerWord, 0, /[iyj]$/.test(owner) ? 'twojej' : 'twojego');
    return describeRelationship({ ...rel, label: words.join(' ') });
  }
  const firstWord = words[0]!.toLowerCase();
  const pronoun = firstWord.endsWith('a') ? 'Twoja' : firstWord.endsWith('o') || firstWord.endsWith('e') ? 'Twoje' : 'Twój';
  return describeRelationship({ ...rel, label: `${pronoun} ${rel.label.charAt(0).toLowerCase()}${rel.label.slice(1)}` });
}
