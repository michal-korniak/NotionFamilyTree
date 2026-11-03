import { GRAVES, PEOPLE, UNIONS } from '../lib/notion/notionMapping';
import { thumbnailColumn } from '../lib/notion/notionPhotos';

type Column = [name: string, type: string, note?: string];

const peopleColumns: Column[] = [
  [PEOPLE.name, 'Tytuł', 'kolumna wymagana'],
  [PEOPLE.givenNames, 'Tekst'],
  [PEOPLE.birthSurname, 'Tekst'],
  [PEOPLE.marriedSurname, 'Tekst'],
  [PEOPLE.gender, 'Wybór', 'opcje: Mężczyzna, Kobieta'],
  [PEOPLE.birthDate, 'Data', 'albo Tekst w starszych bazach'],
  [PEOPLE.birthPrecision, 'Wybór', 'dokładność daty, np. YearOnly, About Month+Year'],
  [PEOPLE.birthPlace, 'Tekst'],
  [PEOPLE.deathDate, 'Data', 'albo Tekst w starszych bazach'],
  [PEOPLE.deathPrecision, 'Wybór', 'dokładność daty; Unknown: zmarł, data nieznana'],
  [PEOPLE.deathPlace, 'Tekst'],
  [PEOPLE.photos, 'Pliki i multimedia', 'zdjęcia osoby'],
  [thumbnailColumn(PEOPLE.photos), 'Pliki i multimedia', 'miniatury zdjęć, dodawane przez aplikację'],
  [PEOPLE.grave, 'Relacja z bazą Groby', `opcjonalna; druga strona relacji „${GRAVES.buried}”`],
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
  [UNIONS.date, 'Data', 'albo Tekst w starszych bazach'],
  [UNIONS.datePrecision, 'Wybór', 'dokładność daty'],
  [UNIONS.place, 'Tekst'],
  [UNIONS.ending, 'Wybór'],
  [UNIONS.notes, 'Tekst'],
];

const graveColumns: Column[] = [
  [GRAVES.title, 'Tytuł'],
  [GRAVES.cemetery, 'Tekst'],
  [GRAVES.info, 'Tekst'],
  [GRAVES.photos, 'Pliki i multimedia', 'zdjęcia nagrobka'],
  [thumbnailColumn(GRAVES.photos), 'Pliki i multimedia', 'miniatury, dodawane przez aplikację'],
  [GRAVES.buried, 'Relacja z bazą Osoby', 'osoby pochowane w tym grobie'],
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
        <p>Potrzebna jest strona <span className="font-medium text-zinc-700 dark:text-zinc-300">Drzewo</span> z bazami danych <span className="font-medium text-zinc-700 dark:text-zinc-300">Osoby</span> i <span className="font-medium text-zinc-700 dark:text-zinc-300">Związki</span> (oraz opcjonalnie <span className="font-medium text-zinc-700 dark:text-zinc-300">Groby</span>). Nazwy kolumn muszą być identyczne jak poniżej, łącznie z polskimi znakami. Daty zapisuje się jako zwykły tekst, np. „12 maja 1950” lub „1950”.</p>
        <ColumnTable title="Osoby" columns={peopleColumns} />
        <ColumnTable title="Związki" columns={unionColumns} />
        <ColumnTable title="Groby" columns={graveColumns} />
      </div>
    </details>
  );
}
