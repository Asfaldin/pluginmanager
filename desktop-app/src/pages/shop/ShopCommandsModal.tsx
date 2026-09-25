import { CopyRow } from "../../components/EditorBits";
import MinecraftTextPreview from "../../components/MinecraftTextPreview";
import type { ShopFile } from "./shopPageShared";

export default function ShopCommandsModal({ file, onClose }: { file: ShopFile; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide card" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <h2 style={{ margin: 0, flex: 1 }}>Komendy Sklepu</h2>
          <button type="button" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <p className="muted small">
          Gracz: /shop, /sell (przedmiot z ręki), /sellall (wszystkie takie jak w ręce). Admin (uprawnienie mainplugins.shop.admin) - w konsoli bez „/”.
          Przedmiot w komendach to np. DIAMOND albo custom:spawner_zombie (podpowiada się klawiszem Tab).
        </p>
        <div className="ci-section-title">Dla graczy</div>
        <div className="ci-protip">
          <CopyRow cmd="/shop <kategoria>" what="otwiera od razu kategorię (id albo nazwa, np. /shop rudy i minerały)" />
          <CopyRow cmd="/shop szukaj <nazwa>" what="od razu wyniki wyszukiwania, bez klikania „Szukaj”" />
          <CopyRow cmd="/cena" what="ceny przedmiotu w ręce: kupno, skup teraz, promocja i rabat rangi (też /price)" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Zarządzanie
        </div>
        <div className="ci-protip">
          <CopyRow cmd="/@shop reload" what="wczytuje sklep od nowa (aplikacja robi to sama po „Wyślij na serwer”)" />
          <CopyRow cmd="/@shop info <przedmiot>" what="ceny i stan rynku przedmiotu" />
          <CopyRow cmd="/@shop price <przedmiot> buy <kwota>" what="zmienia cenę kupna za całą paczkę (np. 640 za 64 szt.) - pokaże też cenę za sztukę i zapyta o potwierdzenie" />
          <CopyRow cmd="/@shop price <przedmiot> sell <kwota>" what="zmienia cenę skupu za całą paczkę" />
          <CopyRow cmd="/@shop multiplier <przedmiot> +20" what="ręcznie zmienia skup o tyle procent (ceny dynamiczne dalej działają)" />
          <CopyRow cmd="/@shop event <przedmiot> +50 2h" what="event: skup +50% przez 2 godziny (bez czasu - aż do „off”)" />
          <CopyRow cmd="/@shop event <przedmiot> off" what="kończy event na przedmiocie" />
          <CopyRow cmd="/@shop event list" what="lista trwających eventów" />
          <CopyRow cmd="/@shop event offall" what="kończy wszystkie eventy naraz" />
          <CopyRow cmd="/@shop sale <przedmiot|kategoria|all> -20 2h" what="promocja na kupno: 20% taniej przez 2 godziny (bez czasu - aż do „off”)" />
          <CopyRow cmd="/@shop sale <cel> off" what="kończy promocję" />
          <CopyRow cmd="/@shop sale list" what="lista trwających promocji" />
          <CopyRow cmd="/@shop sale offall" what="kończy wszystkie promocje naraz" />
          <CopyRow cmd="/@shop history <przedmiot>" what="ile sprzedano w ostatnich dniach i po ile" />
          <CopyRow cmd="/@shop top" what="kto dziś najwięcej zarobił na sprzedaży (/@shop top tydzien - 7 dni)" />
          <CopyRow cmd="/@shop reset <przedmiot>" what="skup przedmiotu wraca do normy" />
          <CopyRow cmd="/@shop resetall" what="wszystkie ceny skupu wracają do normy (potem /@shop confirm)" />
          <CopyRow cmd="/@shop rotation" what="co jest teraz w rotacji" />
          <CopyRow cmd="/@shop rotation force" what="losuje nową ofertę rotacji od razu" />
          <CopyRow cmd="/@shop stats" what="dzisiejsza sprzedaż (gdy statystyki są włączone)" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Twoje kategorie z rotacją
        </div>
        <div className="ci-protip">
          {file.cats.filter((c) => c.rotation?.enabled).length === 0 && <span className="muted small">Żadna kategoria nie ma rotacji.</span>}
          {file.cats
            .filter((c) => c.rotation?.enabled)
            .map((c) => (
              <CopyRow key={c.id} cmd={`/@shop rotation force ${c.id}`} what={<MinecraftTextPreview text={c.name} emptyLabel={c.id} />} />
            ))}
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          NPC i tabliczki w świecie
        </div>
        <p className="muted small">
          Zamiast kategorii można wpisać main - wtedy otwiera się menu główne sklepu. Komendy „patrząc na...” działają z odległości do 5 kratek.
        </p>
        <div className="ci-protip">
          <CopyRow cmd="/@shop npc create <kategoria> <nazwa>" what="stawia w Twoim miejscu NPC (wieśniaka), który po kliknięciu otwiera sklep" />
          <CopyRow cmd="/@shop npc name <nazwa>" what="patrząc na NPC: nowa nazwa nad głową (kolory przez &, np. &a&lSprzedawca)" />
          <CopyRow cmd="/@shop npc type <mob>" what="patrząc na NPC: inny wygląd, np. iron_golem, zombie, fox (wieśniakowi można dodać zawód: villager librarian)" />
          <CopyRow cmd="/@shop npc category <kategoria>" what="patrząc na NPC: zmienia, co otwiera" />
          <CopyRow cmd="/@shop npc remove" what="patrząc na NPC: usuwa go" />
          <CopyRow cmd="/@shop sign <kategoria>" what="patrząc na tabliczkę: sama wpisuje napisy i otwiera sklep po kliknięciu; zniszczy ją tylko admin ze Shiftem" />
          <CopyRow cmd="/@shop sign remove" what="patrząc na tabliczkę: znowu zwykła tabliczka" />
          <CopyRow cmd="/@shop open <gracz> <kategoria>" what="otwiera sklep graczowi - do menu serwera i NPC z innych pluginów; zamiast nicku wpisz tam znacznik gracza z tamtego pluginu (np. %player%)" />
        </div>
        <div className="ci-section-title" style={{ marginTop: "1rem" }}>
          Gotowe NPC dla Twoich kategorii
        </div>
        <div className="ci-protip">
          {file.cats.map((c) => (
            <CopyRow key={c.id} cmd={`/@shop npc create ${c.id} ${c.name}`} what={<MinecraftTextPreview text={c.name} emptyLabel={c.id} />} />
          ))}
        </div>
      </div>
    </div>
  );
}
