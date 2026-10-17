/**
 * Refume: perfume notes dictionary (Polish names), used by the notes picker and to translate
 * notes from Fragella (English). Listings store note ids (e.g. "bergamot"), pages show Polish.
 *
 * Format of each line: id | English name(s, comma separated) | Polish name | Polish aliases
 */
const RAW = `
bergamot|Bergamot,Calabrian Bergamot|Bergamotka|
lemon|Lemon,Amalfi Lemon,Sicilian Lemon|Cytryna|
lime|Lime|Limonka|
orange|Orange,Sweet Orange|Pomarańcza|
bitter-orange|Bitter Orange|Gorzka pomarańcza|
blood-orange|Blood Orange|Czerwona pomarańcza|
mandarin|Mandarin Orange,Mandarin,Green Mandarin|Mandarynka|
tangerine|Tangerine|Tangerynka|
clementine|Clementine|Klementynka|
grapefruit|Grapefruit,Pink Grapefruit|Grejpfrut|
yuzu|Yuzu|Yuzu|
citron|Citron|Cedrat|
kumquat|Kumquat|Kumkwat|
neroli|Neroli|Neroli|
petitgrain|Petitgrain|Petitgrain|
lemon-verbena|Lemon Verbena|Werbena cytrynowa|
verbena|Verbena|Werbena|
lemongrass|Lemongrass|Trawa cytrynowa|
citruses|Citruses,Citrus,Citrus Notes|Cytrusy|nuty cytrusowe
apple|Apple,Red Apple|Jabłko|
green-apple|Green Apple|Zielone jabłko|
pear|Pear|Gruszka|
peach|Peach|Brzoskwinia|
apricot|Apricot|Morela|
nectarine|Nectarine|Nektarynka|
plum|Plum,Damson Plum|Śliwka|
cherry|Cherry,Sour Cherry|Wiśnia|czereśnia
black-cherry|Black Cherry|Czarna wiśnia|
raspberry|Raspberry|Malina|
strawberry|Strawberry,Wild Strawberry|Truskawka|
blackberry|Blackberry|Jeżyna|
black-currant|Black Currant,Blackcurrant,Cassis|Czarna porzeczka|
red-currant|Red Currant|Czerwona porzeczka|
blueberry|Blueberry,Bilberry|Borówka|jagoda
cranberry|Cranberry|Żurawina|
red-berries|Red Berries|Czerwone owoce|
berries|Berries,Wild Berries|Owoce leśne|jagody
pineapple|Pineapple|Ananas|
mango|Mango|Mango|
passion-fruit|Passionfruit,Passion Fruit|Marakuja|
coconut|Coconut|Kokos|
banana|Banana|Banan|
fig|Fig|Figa|
fig-leaf|Fig Leaf|Liść figowca|
melon|Melon|Melon|
watermelon|Watermelon|Arbuz|
lychee|Litchi,Lychee|Liczi|
pomegranate|Pomegranate|Granat|
grape|Grape,Grapes|Winogrono|
quince|Quince|Pigwa|
rhubarb|Rhubarb|Rabarbar|
guava|Guava|Guawa|
papaya|Papaya|Papaja|
kiwi|Kiwi|Kiwi|
date|Dates,Date|Daktyl|
goji|Goji Berries|Jagody goji|
fruity-notes|Fruity Notes,Fruits|Nuty owocowe|owoce
tropical-fruits|Tropical Fruits|Owoce tropikalne|
rose|Rose|Róża|
damask-rose|Damask Rose|Róża damasceńska|
bulgarian-rose|Bulgarian Rose|Róża bułgarska|
turkish-rose|Turkish Rose|Róża turecka|
may-rose|May Rose,Rose de Mai|Róża majowa|
jasmine|Jasmine|Jaśmin|
jasmine-sambac|Jasmine Sambac,Sambac|Jaśmin sambac|
tuberose|Tuberose|Tuberoza|
orange-blossom|Orange Blossom,African Orange Flower|Kwiat pomarańczy|
ylang-ylang|Ylang-Ylang,Ylang Ylang|Ylang-ylang|
iris|Iris|Irys|
orris|Orris Root,Orris|Korzeń irysa|
violet|Violet|Fiołek|
violet-leaf|Violet Leaf|Liść fiołka|
lily-of-the-valley|Lily-of-the-Valley,Lily of the Valley,Muguet|Konwalia|
lily|Lily|Lilia|
peony|Peony|Piwonia|
magnolia|Magnolia|Magnolia|
gardenia|Gardenia|Gardenia|
freesia|Freesia|Frezja|
lavender|Lavender|Lawenda|
geranium|Geranium|Pelargonia|geranium
heliotrope|Heliotrope|Heliotrop|
mimosa|Mimosa|Mimoza|
osmanthus|Osmanthus|Osmantus|
orchid|Orchid,Vanilla Orchid|Storczyk|orchidea
lotus|Lotus|Lotos|
water-lily|Water Lily|Lilia wodna|
carnation|Carnation|Goździk (kwiat)|
honeysuckle|Honeysuckle|Wiciokrzew|
hyacinth|Hyacinth|Hiacynt|
narcissus|Narcissus,Daffodil|Narcyz|
cyclamen|Cyclamen|Cyklamen|
lilac|Lilac|Bez|
frangipani|Frangipani,Plumeria|Frangipani|plumeria
champaca|Champaca|Champaka|
tiare|Tiare Flower,Tiare|Kwiat tiare|
cherry-blossom|Cherry Blossom,Sakura|Kwiat wiśni|sakura
apple-blossom|Apple Blossom|Kwiat jabłoni|
acacia|Acacia|Akacja|
linden|Linden Blossom,Linden|Lipa|
elderflower|Elderflower|Kwiat czarnego bzu|
chamomile|Chamomile|Rumianek|
immortelle|Immortelle,Helichrysum|Kocanka|
davana|Davana|Davana|
white-flowers|White Flowers|Białe kwiaty|
floral-notes|Floral Notes,Flowers|Nuty kwiatowe|kwiaty
mint|Mint,Spearmint|Mięta|
peppermint|Peppermint|Mięta pieprzowa|
basil|Basil|Bazylia|
sage|Sage|Szałwia|
clary-sage|Clary Sage|Szałwia muszkatołowa|
rosemary|Rosemary|Rozmaryn|
thyme|Thyme|Tymianek|
tarragon|Tarragon|Estragon|
artemisia|Artemisia,Wormwood|Bylica|piołun
galbanum|Galbanum|Galbanum|
green-notes|Green Notes|Nuty zielone|
grass|Grass,Cut Grass|Trawa|
tea|Tea|Herbata|
green-tea|Green Tea|Zielona herbata|
black-tea|Black Tea|Czarna herbata|
mate|Mate,Yerba Mate|Yerba mate|
bamboo|Bamboo|Bambus|
ivy|Ivy|Bluszcz|
tomato-leaf|Tomato Leaf|Liść pomidora|
cucumber|Cucumber|Ogórek|
aloe|Aloe Vera|Aloes|
fern|Fern|Paproć|
juniper|Juniper Berries,Juniper|Jałowiec|
coriander|Coriander|Kolendra|
cannabis|Cannabis,Hemp|Konopie|
hay|Hay|Siano|
cypress|Cypress|Cyprys|
pine|Pine,Pine Needles|Sosna|
fir|Fir,Fir Balsam|Jodła|
eucalyptus|Eucalyptus|Eukaliptus|
bay-leaf|Bay Leaf,Laurel|Liść laurowy|
herbs|Herbal Notes,Herbs|Zioła|
pepper|Pepper|Pieprz|
black-pepper|Black Pepper|Czarny pieprz|
pink-pepper|Pink Pepper|Różowy pieprz|
sichuan-pepper|Sichuan Pepper|Pieprz syczuański|
cardamom|Cardamom|Kardamon|
cinnamon|Cinnamon|Cynamon|
cloves|Cloves,Clove|Goździki (przyprawa)|
nutmeg|Nutmeg|Gałka muszkatołowa|
ginger|Ginger|Imbir|
saffron|Saffron|Szafran|
cumin|Cumin|Kmin rzymski|
star-anise|Star Anise|Anyż gwiazdkowaty|
anise|Anise,Aniseed|Anyż|
licorice|Licorice,Liquorice|Lukrecja|
caraway|Caraway|Kminek|
elemi|Elemi|Elemi|
chili|Chili Pepper,Chili|Chili|
fennel|Fennel|Koper włoski|
turmeric|Turmeric|Kurkuma|
spices|Spices,Spicy Notes|Przyprawy|
cedar|Cedar|Cedr|
virginia-cedar|Virginian Cedar,Virginia Cedar|Cedr wirginijski|
atlas-cedar|Atlas Cedar|Cedr atlaski|
sandalwood|Sandalwood,Australian Sandalwood,Mysore Sandalwood|Drzewo sandałowe|sandał
vetiver|Vetiver,Haitian Vetiver|Wetyweria|
patchouli|Patchouli|Paczula|
oud|Agarwood (Oud),Oud,Agarwood|Oud|drzewo agarowe
guaiac-wood|Guaiac Wood|Gwajakowiec|
birch|Birch,Birch Tar|Brzoza|
cashmeran|Cashmeran|Kaszmeran|
cashmere-wood|Cashmere Wood|Drzewo kaszmirowe|
ebony|Ebony,Ebony Wood|Heban|
rosewood|Rosewood|Palisander|
teak|Teak Wood,Teak|Tek|
oak|Oak|Dąb|
oakmoss|Oak Moss,Oakmoss|Mech dębowy|
moss|Moss,Tree Moss|Mech|
driftwood|Driftwood|Drewno dryfujące|
woody-notes|Woody Notes,Woods|Nuty drzewne|drewno
papyrus|Papyrus|Papirus|
cypriol|Cypriol Oil or Nagarmotha,Cypriol,Nagarmotha|Cypriol|
hinoki|Hinoki Wood,Hinoki|Hinoki|
palo-santo|Palo Santo|Palo santo|
amberwood|Amberwood,Ambery Wood|Drzewo ambrowe|
iso-e-super|Iso E Super|Iso E Super|
ambroxan|Ambroxan,Ambrox|Ambroksan|
ambrette|Ambrette (Musk Mallow),Ambrette|Ambretta|
amber|Amber|Ambra|bursztyn
ambergris|Ambergris|Ambra szara|
labdanum|Labdanum,Cistus|Labdanum|
benzoin|Benzoin|Benzoes|
myrrh|Myrrh|Mirra|
incense|Incense,Olibanum,Frankincense|Kadzidło|olibanum
tolu-balsam|Tolu Balsam|Balsam tolu|
peru-balsam|Peru Balsam|Balsam peruwiański|
styrax|Styrax|Styraks|
opoponax|Opoponax|Opoponaks|
resins|Resins,Resin|Żywice|
musk|Musk,Musks|Piżmo|
white-musk|White Musk|Białe piżmo|
leather|Leather|Skóra|
suede|Suede|Zamsz|
castoreum|Castoreum|Kastoreum|
civet|Civet|Cywet|
vanilla|Vanilla,Madagascar Vanilla|Wanilia|
bourbon-vanilla|Bourbon Vanilla|Wanilia Bourbon|
tonka-bean|Tonka Bean,Tonka|Fasola tonka|
caramel|Caramel|Karmel|
chocolate|Chocolate,Dark Chocolate|Czekolada|
cacao|Cacao,Cocoa|Kakao|
coffee|Coffee|Kawa|
honey|Honey|Miód|
praline|Praline|Pralina|
almond|Almond,Bitter Almond|Migdał|
hazelnut|Hazelnut|Orzech laskowy|
pistachio|Pistachio|Pistacja|
chestnut|Chestnut|Kasztan|
sugar|Sugar|Cukier|
brown-sugar|Brown Sugar|Brązowy cukier|
cotton-candy|Cotton Candy|Wata cukrowa|
marshmallow|Marshmallow|Pianka marshmallow|
milk|Milk|Mleko|
cream|Cream,Whipped Cream|Śmietanka|bita śmietana
butter|Butter|Masło|
rum|Rum|Rum|
whiskey|Whiskey,Whisky,Bourbon Whiskey|Whisky|
cognac|Cognac|Koniak|
champagne|Champagne|Szampan|
wine|Wine,Red Wine|Wino|
toffee|Toffee|Toffi|
meringue|Meringue|Beza|
biscuit|Biscuit,Cookie|Herbatnik|ciastko
maple|Maple Syrup,Maple|Syrop klonowy|
tobacco|Tobacco,Tobacco Leaf|Tytoń|
coumarin|Coumarin|Kumaryna|
sea-notes|Sea Notes,Marine Notes,Marine|Nuty morskie|morze
water-notes|Water Notes,Aquatic Notes,Aquatic|Nuty wodne|
ozonic|Ozonic notes,Ozonic Notes,Ozone|Nuty ozonowe|
sea-salt|Sea Salt,Salt|Sól morska|sól
calone|Calone|Kalon|
aldehydes|Aldehydes|Aldehydy|
metallic|Metallic Notes|Nuty metaliczne|
mineral|Mineral Notes|Nuty mineralne|
earthy|Earthy Notes|Nuty ziemiste|ziemia
smoke|Smoke,Smoky Notes|Dym|
rain|Rain|Deszcz|
powdery|Powdery Notes|Nuty pudrowe|puder
soap|Soap,Soapy Notes|Mydło|
`;

const ACCORDS_RAW = `
citrus|cytrusowy
woody|drzewny
aromatic|aromatyczny
fresh spicy|świeży przyprawowy
warm spicy|ciepły przyprawowy
soft spicy|delikatny przyprawowy
amber|ambrowy
vanilla|waniliowy
sweet|słodki
powdery|pudrowy
floral|kwiatowy
white floral|białe kwiaty
yellow floral|żółte kwiaty
fruity|owocowy
fresh|świeży
green|zielony
musky|piżmowy
leather|skórzany
balsamic|balsamiczny
earthy|ziemisty
aquatic|wodny
marine|morski
ozonic|ozonowy
rose|różany
lavender|lawendowy
iris|irysowy
violet|fiołkowy
tuberose|tuberozowy
honey|miodowy
coffee|kawowy
cacao|kakaowy
chocolate|czekoladowy
caramel|karmelowy
tobacco|tytoniowy
oud|oudowy
smoky|dymny
animalic|zwierzęcy
lactonic|mleczny
coconut|kokosowy
almond|migdałowy
nutty|orzechowy
herbal|ziołowy
patchouli|paczulowy
mossy|mszysty
soapy|mydlany
salty|słony
metallic|metaliczny
tropical|tropikalny
cherry|wiśniowy
rum|rumowy
whiskey|whisky
anis|anyżowy
cinnamon|cynamonowy
sour|kwaśny
mineral|mineralny
aldehydic|aldehydowy
conifer|iglasty
camphor|kamforowy
beeswax|woskowy
cannabis|konopny
tea|herbaciany
gourmand|gourmand
`;

const normalize = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const NOTES = RAW.trim()
  .split('\n')
  .map(line => {
    const [id, en, pl, aliases] = line.split('|');
    return {
      id: id.trim(),
      en: en.split(',').map(s => s.trim()),
      pl: pl.trim(),
      aliases: (aliases || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    };
  });

const BY_ID = new Map(NOTES.map(n => [n.id, n]));
const BY_EN = new Map();
NOTES.forEach(n => n.en.forEach(e => BY_EN.set(normalize(e), n.id)));
// Longest English names first, for "contains" matching ("Calabrian bergamot" → bergamot)
const EN_TERMS = Array.from(BY_EN.keys()).sort((a, b) => b.length - a.length);

export const noteLabel = id => BY_ID.get(id)?.pl || null;

/** English note from Fragella → note id, or null when it isn't in the dictionary. */
export const matchNote = english => {
  const n = normalize(english);
  if (!n) return null;
  if (BY_EN.has(n)) return BY_EN.get(n);
  if (BY_ID.has(n.replace(/ /g, '-'))) return n.replace(/ /g, '-');
  const padded = ` ${n} `;
  const term = EN_TERMS.find(t => padded.includes(` ${t} `));
  return term ? BY_EN.get(term) : null;
};

/** Translate a list of English notes to unique note ids (unknown ones are skipped). */
export const matchNotes = englishList => {
  const ids = [];
  (englishList || []).forEach(e => {
    const id = matchNote(e);
    if (id && !ids.includes(id)) ids.push(id);
  });
  return ids;
};

/** Notes picker suggestions, matching Polish names, aliases and English names. */
export const suggestNotes = (query, exclude = [], limit = 8) => {
  const q = normalize(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  NOTES.forEach(n => {
    if (exclude.includes(n.id)) return;
    const names = [n.pl, ...n.aliases, ...n.en].map(normalize);
    if (names.some(x => x.startsWith(q) || x.split(' ').some(w => w.startsWith(q)))) {
      starts.push(n);
    } else if (q.length >= 3 && names.some(x => x.includes(q))) {
      contains.push(n);
    }
  });
  return [...starts, ...contains].slice(0, limit);
};

const ACCORDS = new Map(
  ACCORDS_RAW.trim()
    .split('\n')
    .map(l => l.split('|').map(s => s.trim()))
);

/** Fragella accord ("warm spicy") → Polish ("ciepły przyprawowy"); unknown ones are skipped. */
export const translateAccord = accord => ACCORDS.get(String(accord || '').toLowerCase().trim()) || null;

/** Polish main accords, for the "Główne akordy" picker. */
export const ACCORD_LABELS = Array.from(new Set(Array.from(ACCORDS.values())));

export const suggestAccords = (query, exclude = [], limit = 8) => {
  const q = normalize(query);
  if (!q) return [];
  const starts = [];
  const contains = [];
  ACCORD_LABELS.forEach(label => {
    if (exclude.includes(label)) return;
    const n = normalize(label);
    if (n.startsWith(q) || n.split(' ').some(w => w.startsWith(q))) starts.push(label);
    else if (q.length >= 3 && n.includes(q)) contains.push(label);
  });
  return [...starts, ...contains].slice(0, limit).map(label => ({ id: label, pl: label }));
};
