import { PEOPLE, UNIONS } from '../lib/notion/notionMapping';

type Column = [name: string, type: string, note?: string];

const peopleColumns: Column[] = [
  [PEOPLE.name, 'Tytuł', 'kolumna wymagana'],
  [PEOPLE.givenNames, 'Tekst'],
  [PEOPLE.birthSurname, 'Tekst'],
  [PEOPLE.marriedSurname, 'Tekst'],
  [PEOPLE.gender, 'Wybór', 'opcje: Mężczyzna, Kobieta'],
  [PEOPLE.birthDate, 'Tekst'],
  [PEOPLE.birthPlace, 'Tekst'],
  [PEOPLE.deathDate, 'Tekst'],
  [PEOPLE.deathPlace, 'Tekst'],
  [PEOPLE.cemetery, 'Tekst'],
  [PEOPLE.burialInfo, 'Tekst'],
  [PEOPLE.photos, 'Pliki i multimedia', 'zdjęcia osoby'],
  [PEOPLE.gravePhotos, 'Pliki i multimedia', 'zdjęcia nagrobka'],
  [PEOPLE.notes, 'Tekst'],
  [PEOPLE.father, 'Relacja z bazą Osoby', 'kolumna wymagana; relacja dwustronna'],
  [PEOPLE.mother, 'Relacja z bazą Osoby', 'kolumna wymagana; relacja dwustronna'],
  [PEOPLE.childrenA, 'Relacja', `tworzona automatycznie przez relację „${PEOPLE.father}”`],
  [PEOPLE.childrenB, 'Relacja', `tworzona automatycznie przez relację „${PEOPLE.mother}”`],
  [PEOPLE.unions, 'Relacja z bazą Związki', `kolumna wymagana; druga strona relacji „${UNIONS.partners}”`],
  [PEOPLE.externalId, 'Tekst', 'identyfikator nadany przy imporcie'],
];

const unionColumns: Column[] = [
  [UNIONS.title, 'Tytuł'],
  [UNIONS.partners, 'Relacja z bazą Osoby', 'dokładnie dwie osoby'],
  [UNIONS.kind, 'Wybór', 'opcje: Małżeństwo, Narzeczeństwo, Nieformalny'],
  [UNIONS.date, 'Tekst'],
  [UNIONS.place, 'Tekst'],
  [UNIONS.ending, 'Wybór'],
  [UNIONS.notes, 'Tekst'],
];

function ColumnTable({ title, columns }: { title: string; columns: Column[] }) {
  return (
    <div>
      <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">Baza {title}</p>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="text-left text-[10px] tracking-wider text-zinc-400 uppercase">
            <th className="pb-1 font-medium">Kolumna</th>
            <th className="pb-1 font-medium">Typ</th>
            <th className="pb-1 font-medium">Uwagi</th>
          </tr>
        </thead>
        <tbody>
          {columns.map(([name, type, note]) => (
            <tr key={name} className="border-t border-zinc-100 align-top dark:border-zinc-800">
              <td className="py-1 pr-2 font-medium whitespace-nowrap text-zinc-700 dark:text-zinc-300">{name}</td>
              <td className="py-1 pr-2 whitespace-nowrap">{type}</td>
              <td className="py-1 text-zinc-400">{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function NotionStructureHelp() {
  return (
    <details className="mt-2 text-xs text-zinc-500">
      <summary className="cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-300">Jak powinna wyglądać struktura danych w Notion?</summary>
      <div className="mt-2 space-y-3 leading-relaxed">
        <p>Potrzebna jest strona <span className="font-medium text-zinc-700 dark:text-zinc-300">Drzewo</span> z dwiema bazami danych: <span className="font-medium text-zinc-700 dark:text-zinc-300">Osoby</span> i <span className="font-medium text-zinc-700 dark:text-zinc-300">Związki</span>. Nazwy kolumn muszą być identyczne jak poniżej, łącznie z polskimi znakami. Daty zapisuje się jako zwykły tekst, np. „12 maja 1950” lub „1950”.</p>
        <ColumnTable title="Osoby" columns={peopleColumns} />
        <ColumnTable title="Związki" columns={unionColumns} />
      </div>
    </details>
  );
}
