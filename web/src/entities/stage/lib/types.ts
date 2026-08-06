/**
 * Этап номинации (спека 0017/0018/0019, ADR 0014 §1/§3): отдельная сущность,
 * а не поле в `entities/pool`. Номинация может иметь несколько этапов —
 * групповой (`groups`) и/или плейофф-сетку (`bracket`, спека 0018, FR-2), а
 * с 0019 — связанных правилом отбора (`rule`) в параллельные и
 * последовательные ветки схемы (ADR 0014, §1).
 *
 * Сериализуемая форма (без bigint/Date). `type` — строковый литерал, как
 * остальные enum-DTO в проекте (`PoolStatus`, `BoutState`, …): значение,
 * которое реально приходит из `stageToJson` (`lib/grpc/serialize.ts`) —
 * полное имя proto-enum (`STAGE_TYPE_GROUPS`/`STAGE_TYPE_BRACKET`), не
 * сокращение. `status` — статус фиксации состава этого этапа (0018, FR-18):
 * до 0018 жил только в `PoolLayout`, теперь нужен в каждой строке списка
 * этапов. `bracket` заполнен только у `type = STAGE_TYPE_BRACKET` (FR-1).
 * `groups`/`rule` — 0019, см. ниже.
 */

import type { FighterRef, PoolLayoutStatus } from "@/entities/pool/lib/types";

export type StageType =
  | "STAGE_TYPE_UNSPECIFIED"
  | "STAGE_TYPE_GROUPS"
  | "STAGE_TYPE_BRACKET";

export type BracketConfig = {
  size: number;
  thirdPlace: boolean;
};

/**
 * StageSourceKind — источник правила отбора (спека 0019, FR-2): либо
 * активный ростер номинации (питает первый этап), либо другой этап той же
 * номинации, стоящий раньше по порядку. `UNSPECIFIED` — правила нет.
 */
export type StageSourceKind =
  | "STAGE_SOURCE_KIND_UNSPECIFIED"
  | "STAGE_SOURCE_KIND_ROSTER"
  | "STAGE_SOURCE_KIND_STAGE";

/**
 * StageSelectorKind — кого из источника берём (0019, FR-3): все участники
 * (единственный вариант для источника-ростера), места X–Y каждой группы
 * источника, либо места X–Y сводного порядка источника (FR-5).
 */
export type StageSelectorKind =
  | "STAGE_SELECTOR_KIND_UNSPECIFIED"
  | "STAGE_SELECTOR_KIND_ALL"
  | "STAGE_SELECTOR_KIND_GROUP_PLACES"
  | "STAGE_SELECTOR_KIND_OVERALL_PLACES";

/**
 * StageLayoutMethod — как отобранные ложатся в целевой этап (0019, FR-4):
 * однозначно определяется типом целевого этапа, организатору не
 * предлагается — змейка в группы, посев 1×N в сетку.
 */
export type StageLayoutMethod =
  | "STAGE_LAYOUT_METHOD_UNSPECIFIED"
  | "STAGE_LAYOUT_METHOD_SNAKE"
  | "STAGE_LAYOUT_METHOD_SEEDED";

/**
 * GroupsConfig — параметр группового этапа: число групп (0019, FR-8). Живёт
 * с этапом, а не спрашивается при каждом формировании. Заполнен только у
 * явно созданного group-этапа; у авто-этапа номинации (0017, FR-4) —
 * `groupCount = 0` (FR-9).
 */
export type GroupsConfig = {
  groupCount: number;
};

/**
 * SeedingRule — правило отбора этапа (0019, FR-1..FR-4): тройка
 * «источник — селектор — метод раскладки». `sourceStageId` заполнен только
 * при `sourceKind = STAGE`. `placeTo = 0` — открытая верхняя граница («3 и
 * ниже»); для `selector = ALL` границы игнорируются.
 */
export type SeedingRule = {
  sourceKind: StageSourceKind;
  sourceStageId: string;
  selector: StageSelectorKind;
  placeFrom: number;
  placeTo: number; // 0 — открытая граница
  method: StageLayoutMethod;
};

export type Stage = {
  id: string;
  nominationId: string;
  position: number;
  title: string;
  type: StageType;
  status: PoolLayoutStatus;
  bracket: BracketConfig | null;
  groups: GroupsConfig | null; // заполнен только у явно созданного group-этапа
  rule: SeedingRule | null; // null — правила нет (набирается руками)
};

/**
 * StageBuildEntry — одна строка превью формирования (0019, FR-15/FR-27):
 * отобранный боец, откуда пришёл (`originLabel` — готовая строка сервера,
 * «Группа 2, место 1», клиент её не собирает) и куда попадает (номер группы
 * либо номер слота сетки — используется только соответствующее поле).
 */
export type StageBuildEntry = {
  fighter: FighterRef;
  originLabel: string;
  sourcePlace: number;
  overallPlace: number;
  targetPoolNumber: number;
  targetSlot: number;
};

/**
 * StageBuildTie — неразрешённый дележ на границе отбора (0019, FR-22):
 * `sourcePoolId` пуст, если дележ в сводном порядке (селектор
 * `OVERALL_PLACES`). `slotsLeft` — сколько из претендентов реально проходит.
 */
export type StageBuildTie = {
  sourcePoolId: string;
  groupLabel: string;
  place: number;
  contenders: FighterRef[];
  slotsLeft: number;
};

/**
 * TieResolution — ответ организатора на дележ (0019, FR-22/FR-24): порядок
 * в `fighterIds` — порядок прохода, первые `slotsLeft` претендентов
 * проходят. Не персистится: живёт ровно один вызов формирования.
 */
export type TieResolution = {
  sourcePoolId: string;
  place: number;
  fighterIds: string[];
};

/**
 * StageBuildPreview — превью формирования этапа целиком (0019, FR-15).
 * `overlaps` непуст ⇒ формирование будет отклонено (FR-11); `ties` непуст ⇒
 * требуется ответ организатора (FR-22); `sourceUnfinishedBouts > 0` ⇒
 * предупреждение о недоигранном источнике (FR-14).
 */
export type StageBuildPreview = {
  entries: StageBuildEntry[];
  unselected: FighterRef[];
  capacity: number;
  ties: StageBuildTie[];
  overlaps: FighterRef[];
  sourceUnfinishedBouts: number;
};

/**
 * SchemaIssueSeverity — класс проблемы схемы (спека 0020, FR-8): «ошибка» —
 * формирование заведомо не пройдёт (то же, что отклонят гейты 0019);
 * «предупреждение» — пройдёт, но результат может удивить (байи, разрыв
 * покрытия); «информация» — так и задумано (например, непокрытый хвост
 * состава источника — FR-8), но организатор должен это видеть до
 * формирования.
 */
export type SchemaIssueSeverity =
  | "SCHEMA_ISSUE_SEVERITY_UNSPECIFIED"
  | "SCHEMA_ISSUE_SEVERITY_ERROR"
  | "SCHEMA_ISSUE_SEVERITY_WARNING"
  | "SCHEMA_ISSUE_SEVERITY_INFO";

/**
 * SchemaIssueCode — конкретная проблема схемы (спека 0020, FR-8): девять
 * кодов, три на класс `error`, три на `warning`, один `TAIL_UNCOVERED` на
 * `info`, плюс `UNSPECIFIED`. Групповой этап с **одной** группой («финал
 * трёх», FR-8a) кодом намеренно не покрыт — это законный формат, а не
 * проблема.
 */
export type SchemaIssueCode =
  | "SCHEMA_ISSUE_CODE_UNSPECIFIED"
  | "SCHEMA_ISSUE_CODE_NO_GROUP_COUNT"
  | "SCHEMA_ISSUE_CODE_BAD_SOURCE"
  | "SCHEMA_ISSUE_CODE_SOURCE_CYCLE"
  | "SCHEMA_ISSUE_CODE_SELECTOR_OVERLAP"
  | "SCHEMA_ISSUE_CODE_CAPACITY_EXCEEDED"
  | "SCHEMA_ISSUE_CODE_CAPACITY_UNDERFILL"
  | "SCHEMA_ISSUE_CODE_COVERAGE_GAP"
  | "SCHEMA_ISSUE_CODE_OVERLAP_UNKNOWN"
  | "SCHEMA_ISSUE_CODE_TAIL_UNCOVERED";

/**
 * SchemaIssue — одна проблема схемы, привязанная к одному или двум этапам
 * (спека 0020, FR-8). `message` — готовая строка сервера (то же правило, что
 * у `StageBuildEntry.originLabel`, 0019): клиент её не собирает из `code` и
 * `severity`, только показывает. Приезжает вместе со списком этапов
 * (`ListStagesResponse.issues`) — диагностика читается из того же запроса,
 * что и схема, отдельного RPC нет (FR-8, FR-9 — сама ничего не блокирует).
 */
export type SchemaIssue = {
  severity: SchemaIssueSeverity;
  code: SchemaIssueCode;
  stageIds: string[];
  message: string;
};

/**
 * FormatStageSpec — один этап схемы вне привязки к номинации (спека 0020,
 * FR-11): пресет и копия схемы между номинациями оперируют такими же
 * значениями, что и `Stage`, но без `id`/`nominationId`/`position`/`status`.
 * Ссылка на источник — `sourceIndex`, **индекс** в том же списке
 * `FormatPreset.stages` (или `FormatSpec` при передаче схемы номинации), а не
 * UUID: спецификация обязана быть переносимой между номинациями и переживать
 * турнир (FR-16). `sourceIndex = -1` — у этапа нет источника-этапа (правила
 * нет либо источник — ростер номинации, см. `sourceKind`).
 */
export type FormatStageSpec = {
  title: string;
  type: StageType;
  bracket: BracketConfig;
  groups: GroupsConfig;
  sourceKind: StageSourceKind;
  sourceIndex: number;
  selector: StageSelectorKind;
  placeFrom: number;
  placeTo: number;
  method: StageLayoutMethod;
};

/**
 * FormatPreset — именованная схема в библиотеке форматов (спека 0020,
 * FR-11/FR-12): не привязана ни к турниру, ни к номинации и переживает и то,
 * и другое (NFR — «библиотека рассчитана на десятки записей»). Копия по
 * значению в обе стороны (FR-16): дальнейшие правки схемы номинации не
 * меняют пресет, а переименование/удаление пресета не меняет номинации, к
 * которым он уже применялся.
 */
export type FormatPreset = {
  id: string;
  name: string;
  stages: FormatStageSpec[];
  createdAt: string; // ISO — сериализация из proto в другом треке (lib/grpc/serialize.ts)
  updatedAt: string;
};
