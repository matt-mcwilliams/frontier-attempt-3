import { importDoi } from "../server/sources.ts";
for (const doi of ["10.1007/BF02295430", "10.3102/1076998607309474"]) {
  const p = await importDoi(doi);
  console.log(
    JSON.stringify(
      {
        title: p.title,
        authors: p.authors,
        year: p.year,
        doi: p.doi,
        access: p.access,
        provenance: p.provenance,
        oaUrl: p.oaUrl,
      },
      null,
      2,
    ),
  );
}
