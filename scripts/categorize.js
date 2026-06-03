const fs = require('fs');
const path = require('path');

const rawItems = `Tangit,250ml,1 box
Tangit,500ml,1 box
Tangit,250ml,1 box
Tangit,500ml,1 box + 14 pieces
Silicon gp ntc - Henkel clear,17 pieces
silicon sheng bao,,1 box
Tizo,,1 box
Era 500ml,,1 box
Kk basin tap,,10 pcs
pillar tap linko,,10 pcs
wall tap linko,,10 pcs
pillar self closing,,4 pcs
kingmisa mixer,,3 pcs
Uzuri kitchen tap,,10 pcs
Ena shower,,2 pcs
DLG 243ml,,1 box
DLG silicon,,1 box
Insulating tape small,,20 pcs
Aloe brush tth,,19 pcs
Potoc black,,11 pcs
Potoc white,,8 pcs
potoc clear,,10 pcs
ppr 1/21 cement,,100 pcs
pvc bond 4",,40 pcs
Mtd bush,4x3,50 pcs
Mtd bush,4x2,50 pcs
plug,3",40 pcs
1 way,,20 pcs
4" 45°,,16 pcs
4 way,,15 pcs
Mtd sec 3/4,,50 pcs
Tee 2",,50 pcs pvc
bend 2" 90°,,15 pcs
Guft clip,,100 pcs
bend 3",,25 pcs
Tee 3",,10 pcs
tank conn,1/2",2 pcs
tank conn,3/4",8 pcs
tank conn,1",5 pcs
tank conn,1 1/2",2 pcs
tank conn,2",3 pcs
min valve,300 pcs + 140,440 pcs
conn strip,,200 pcs
Tail off,,200 pcs
end cap,,100 pcs
Mtd bush,,200 pcs
Ppr union,32mm,1 pkt
Pvc h/d coupling,32mm,19 pcs
Tee,3/4 ppr,160 pcs
elbow,1/2 ppr,300 pcs
socket,1/2 ppr,160 pcs
ppr union,20mm,16 pcs
high level ball valve,,16 pcs
Magic 1/2 (white),,10 pcs
Magic 1 1/4 (white),,10 pcs
Magic 1/2 (chrome),,10 pcs
Mtd clip 1/2,,70 pcs
Arabic (toilet),,3 pcs
Bathroom shelf - Uzuri,,2 pcs
Gate valve 1/2,,5 pcs
Ppr tap 1/2,,20 pcs
Soap dish,,4 pcs
Soap holder,,4 pcs
Liquid soap holder - wall mount,,3 pcs
tissue holder (plastic) - open,,5 pcs
Drying rack (dish),,10 pcs
Toothbrush holder (plastic),,5 pcs
tissue holder,,5 pcs (chrome)
tissue holder (gold),,5 pcs
Locks (Golden),,3 pcs
locks (Silver),,2 pcs s.l
bottle trap,,5 pcs plastic
bottle trap,1 1/4,5 pcs s/s
bottle trap,1 1/2,5 pcs s/s
Ang valve,(2 cartons - each 100),200 pcs Henmed
Arldite,4 packets,4 packets
Binding wire,20",5 pcs
Aquafix - wall,,1 packet
Magnifier pillar,,2 packets
Grinding 7" (pipes),,5 pcs
Poly disc,,4 pcs
Diamond cutting disc,,5 pcs
cutting wood 7",3 pcs (cali)
Cutting 9" (Castiel),,15 pcs
Cutting disc (rhodius),(S.L),7 pcs
cutting disc 9" (S.L),,8 pcs
Cutting (iron),,5 pcs
Ardalite,,4 pcs
Solder wire,,6 pcs
Pipe cutter (small),,3 pcs
Screw driver (lucas),,5 pcs
Screw driver (big),,2 pcs
Self Screw driver,,8 pcs
2 in one Screw driver,,4 pcs
Solar welding goggles,,4 pcs
Hacksaw,,11 + 3 pcs
chalk line,,5 pcs
spirit level,,5 pcs
pliers,,3 pcs
Trowel,,2 pcs
End clothing,,1 pc
chuck key,,2 pcs
Drill bits set,,2 pcs
Trowel - 7",,1 pc
glass cutter,,1 pc
Shovel (flat),,1 pc
Allen key 2",,1 pc
jigsaw blades,,4 pcs (set)
drill bits,,2 pcs
Drill bits - 18,,2 pcs
flat bits,,3 pcs
chisel,,2 pcs
Shower rose,,5 pcs
Gypsum screws,,9 pcs
screws 1",,3 pcs
Steel nails 2",,4 pcs
Neat valve,12mm,4 pcs
Neat valve,10mm,6 pcs
Neat valve,8mm,2 pcs
Neat valve,6mm,2 pcs
Hanks,,3 pcs
Float valve,,3 pcs
Red glue,,33 pcs (pump)
Metal clip 1/2,,200 pcs
Automatic control,,4 pcs
Bpf tap,,2 pcs
Thread seals (big),,5 pcs
Thread seals (small),,2 pkts
pipe wrench - 18",,2 pcs (s.p.l)
shackle,,2 pair
drill,,1 pc
Dop caps,,2 pcs
Hand saw 18",,2 pcs
Hand saw 16",,2 pcs
H/down 20,,2 pcs
Urinal waste,,2 pcs
Super douch foam,,2 pcs
corona,,5 pcs
Shears,,3 pcs
Garden tap - 3/4,,3/4 - 5 pcs
Garden tap - 1/2,,1/2 - 4 pcs
Ppr handle bar - 3/4,,3 pcs
Ppr handle bar - 1/2,,3 pcs
Shoshana,,5 pcs
Dubi Sinks 1" ppr,,1 pc
Pvc Socket 1" ppr,,1 pc
Reducing pvc,2" - 1 1/2",2 pcs
Mtd mi - 50mm,,1 pc
Mtd mi - 40mm,,1 pc
1/2 in in 50 mtr s,,1 pc
1/2 in in 15 mtr s,,1 pc
1/2 in in 30 mtr s,,1 pc
1/2 in gift,,1 pc
Maders,,4 pcs
Electrode,,1 pc
Pvc glue 1/2L,,5 pcs
Boss white - 400g,,10 pcs
Boss white - 1/4kg,,10 pcs
Ppr Socket 3/4,,54 pcs
Basin mixers,,2 pcs
Wash tap (Chorome),,2 pcs
Adapting Socket,3/4 x 1/2,12 pcs
Reducing Socket,32x25,15 pcs
Suction Top flush,,4 pcs
Pillar tap (plastic),,5 pcs
Pillar tap (waste),,5 pcs
Socket 1" ppr,,10 pcs
Elbow 1" ppr,,12 pcs
Knit (Mtd),1/2,20 pcs
Nipple 1/2,,15 pcs
Super (Plastic),,2 pcs
Self taping screw,,3 pkts
Locks (door lock),,3 pcs
Shower pipes 1 1/2,,20 pcs
Shower pipes 1",,20 pcs
1/2 shower pipes 4ft,,5 pcs
1/2 shower pipes 3ft,,5 pcs
3/4 shower pipes,,4 pcs
Bullcock 3/4 (pvc),,10 pcs
Bullcock 1/2 (pvc),,10 pcs`;

function parseCSV(rawText) {
  const lines = rawText.split('\n');
  const results = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    const parts = line.split(',');

    let name = '';
    let spec = '';
    let qty = '';

    if (parts.length >= 3) {
      name = parts[0].trim();
      qty = parts[parts.length - 1].trim();
      spec = parts.slice(1, parts.length - 1).map(p => p.trim()).filter(Boolean).join(', ');
    } else if (parts.length === 2) {
      name = parts[0].trim();
      qty = parts[1].trim();
    } else {
      name = parts[0].trim();
    }

    results.push({
      name,
      specification: spec || 'N/A',
      quantity: qty || 'N/A'
    });
  }

  return results;
}

const parsed = parseCSV(rawItems);

// Write to CSV
const csvHeader = 'Item Name,Specification/Size,Quantity\n';
const csvLines = parsed.map(item => {
  // Escape quotes in name, spec, qty for valid CSV format
  const escapeCsv = (str) => {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  return `${escapeCsv(item.name)},${escapeCsv(item.specification)},${escapeCsv(item.quantity)}`;
}).join('\n');

const csvContent = csvHeader + csvLines;
const outputPath = path.join(__dirname, '..', 'categorized_items.csv');
fs.writeFileSync(outputPath, csvContent, 'utf-8');

console.log(`Parsed ${parsed.length} items successfully and wrote to ${outputPath}`);
console.log('Sample of parsed items:');
console.table(parsed.slice(0, 10));
