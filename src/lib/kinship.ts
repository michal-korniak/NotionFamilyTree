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
  if (up === 1 && down === 2) return via(up + 1) === 'F' ? byGender(target, 'Siostrzeniec', 'Siostrzenica', 'Dziecko siostry') : byGender(target, 'Bratanek', 'Bratanica', 'Dziecko brata');
  // path[1] is the parent through whom an uncle or aunt is related: stryj on the father's side, wuj on the mother's.
  if (up === 2 && down === 1) return target === 'F' ? 'Ciotka' : via(1) === 'F' ? byGender(target, 'Wuj', 'Ciotka', 'Wujostwo') : byGender(target, 'Stryj', 'Ciotka', 'Stryjostwo');
  // A first cousin is named after the uncle or aunt in between (path[3]): cioteczny through an aunt, stryjeczny through the father's brother, wujeczny through the mother's brother.
  if (up === 2 && down === 2) {
    const side = via(3) === 'F' ? 'cioteczn' : via(3) === 'M' && via(1) === 'M' ? 'stryjeczn' : via(3) === 'M' && via(1) === 'F' ? 'wujeczn' : null;
    return side ? byGender(target, `Brat ${side}y`, `Siostra ${side}a`, `Rodzeństwo ${side}e`) : byGender(target, 'Kuzyn', 'Kuzynka', 'Kuzynostwo');
  }
  if (up === 3 && down === 1) return `${byGender(target, 'Brat', 'Siostra', 'Rodzeństwo')} ${via(2) === 'F' ? 'babci' : 'dziadka'}`;
  if (up === 2 && down === 3) return `${byGender(target, 'Syn', 'Córka', 'Dziecko')} ${via(up + 2) === 'F' ? 'kuzynki' : 'kuzyna'}`;
  if (up === 3 && down === 2) return `${byGender(target, 'Kuzyn', 'Kuzynka', 'Kuzynostwo')} ${via(1) === 'F' ? 'matki' : 'ojca'}`;
  if (up === 3 && down === 3) return byGender(target, 'Kuzyn drugiego stopnia', 'Kuzynka drugiego stopnia', 'Kuzynostwo drugiego stopnia');
  return byGender(target, 'Krewny', 'Krewna', 'Krewny');
}

// Relatives of the reference's spouse, seen from the reference (link runs spouse → target).
function spousesRelativeLabel(link: BloodLink, target: Gender): string {
  const { up, down } = link;
  if (up === 1 && down === 0) return byGender(target, 'Teść', 'Teściowa', 'Teść lub teściowa');
  if (up === 0 && down === 1) return byGender(target, 'Pasierb', 'Pasierbica', 'Pasierb lub pasierbica');
  if (up === 1 && down === 1) return byGender(target, 'Szwagier', 'Szwagierka', 'Szwagier lub szwagierka');
  if (up === 2 && down === 0) return `${byGender(target, 'Dziadek', 'Babcia', 'Dziadek lub babcia')} małżonka`;
  return byGender(target, 'Powinowaty', 'Powinowata', 'Powinowaty');
}

// Spouses of the reference's blood relatives (link runs reference → the relative the target is married to).
function relativesSpouseLabel(link: BloodLink, target: Gender): string {
  const { up, down } = link;
  if (up === 0 && down === 1) return byGender(target, 'Zięć', 'Synowa', 'Zięć lub synowa');
  if (up === 1 && down === 0) return byGender(target, 'Ojczym', 'Macocha', 'Ojczym lub macocha');
  if (up === 1 && down === 1) return byGender(target, 'Szwagier', 'Szwagierka', 'Szwagier lub szwagierka');
  if (up === 2 && down === 1) return byGender(target, 'Mąż ciotki', 'Żona wuja', 'Powinowaty');
  if (up === 0 && down === 2) return byGender(target, 'Mąż wnuczki', 'Żona wnuka', 'Powinowaty');
  return byGender(target, 'Powinowaty', 'Powinowata', 'Powinowaty');
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
  return result && { ...result, label: result.label.charAt(0).toUpperCase() + result.label.slice(1) };
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
    if (link) consider({ kind: 'affinity', label: relativesSpouseLabel(link, target.gender), degree: link.up + link.down, path: [...link.members, targetId] });
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
// ("Mąż ciotki") takes the pronoun on that relative instead: "Mąż twojej ciotki".
const GENITIVE_PRONOUNS: Record<string, string> = { ciotki: 'twojej', siostry: 'twojej', babci: 'twojej', kuzynki: 'twojej', matki: 'twojej', wnuczki: 'twojej', wuja: 'twojego', brata: 'twojego', dziadka: 'twojego', kuzyna: 'twojego', ojca: 'twojego', wnuka: 'twojego' };

export function describeRelationshipToMe(rel: Relationship): string {
  const words = rel.label.split(' ');
  const genitivePronoun = words.length === 2 ? GENITIVE_PRONOUNS[words[1]!] : undefined;
  if (genitivePronoun) return describeRelationship({ ...rel, label: `${words[0]} ${genitivePronoun} ${words[1]}` });
  const firstWord = words[0]!.toLowerCase();
  const pronoun = firstWord.endsWith('a') ? 'Twoja' : firstWord.endsWith('o') || firstWord.endsWith('e') ? 'Twoje' : 'Twój';
  return describeRelationship({ ...rel, label: `${pronoun} ${rel.label.charAt(0).toLowerCase()}${rel.label.slice(1)}` });
}
