import type { Person } from '../types/person';

interface LinkResult {
  people: Person[];
  danglingReferences: number;
}

export function linkRelationships(input: Person[]): LinkResult {
  const byId = new Map(input.map((p) => [p.id, { ...p, parents: new Set<string>(), children: new Set<string>(), spouses: new Set<string>() }]));
  let danglingReferences = 0;

  const link = (fromId: string, toId: string, kind: 'parent' | 'child' | 'spouse') => {
    const from = byId.get(fromId);
    const to = byId.get(toId);
    if (!from || !to) { danglingReferences++; return; }
    if (fromId === toId) return;
    if (kind === 'parent') { from.parents.add(toId); to.children.add(fromId); }
    else if (kind === 'child') { from.children.add(toId); to.parents.add(fromId); }
    else { from.spouses.add(toId); to.spouses.add(fromId); }
  };

  for (const person of input) {
    person.parents.forEach((id) => link(person.id, id, 'parent'));
    person.children.forEach((id) => link(person.id, id, 'child'));
    person.spouses.forEach((id) => link(person.id, id, 'spouse'));
  }

  const people = [...byId.values()].map((p) => ({ ...p, parents: [...p.parents], children: [...p.children], spouses: [...p.spouses] }));
  return { people, danglingReferences };
}

export function relativesOf(person: Person): string[] {
  return [...person.parents, ...person.spouses, ...person.children];
}
