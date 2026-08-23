const fs = require('node:fs')
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(':memory:')
db.exec('PRAGMA foreign_keys = ON')
db.exec(fs.readFileSync('src/main/db/schema.sql', 'utf8'))

let pass = 0, fail = 0
const check = (nom, fn, attendu) => {
  let got
  try { fn(); got = 'accepte' } catch (e) { got = 'refuse' }
  const ok = got === attendu
  console.log((ok ? '  OK   ' : '  ECHEC') + ' | ' + nom + ' -> ' + got)
  ok ? pass++ : fail++
}

// jeu minimal
db.exec(`INSERT INTO roles(id,code,nom,systeme) VALUES (1,'admin','Administrateur',1)`)
db.exec(`INSERT INTO utilisateurs(id,code,identifiant,nom_complet,mot_de_passe_hash,mot_de_passe_sel,mot_de_passe_iter,role_id)
         VALUES (1,'U001','marie','Marie Dupont','h','s',1,1)`)
db.exec(`INSERT INTO produits(id,code_interne,nom_commercial,nom_generique,principe_actif,prix_vente,stock_min)
         VALUES (1,'P001','Doliprane 500 mg','Paracétamol 500 mg','paracétamol',1500,10)`)

console.log('\n-- Intégrité référentielle --')
check('lot rattaché à un produit inexistant', () =>
  db.exec(`INSERT INTO lots(produit_id,date_reception,quantite_initiale,quantite_restante) VALUES (999,'2026-08-24',10,10)`), 'refuse')
check('lot valide', () =>
  db.exec(`INSERT INTO lots(id,produit_id,numero,date_reception,date_peremption,quantite_initiale,quantite_restante,prix_achat)
           VALUES (1,1,'L-AAA','2026-08-24','2027-06-30',100,100,900)`), 'accepte')

console.log('\n-- Contraintes de stock --')
check('quantite_restante > quantite_initiale', () =>
  db.exec(`UPDATE lots SET quantite_restante = 200 WHERE id = 1`), 'refuse')
check('quantite_restante negative', () =>
  db.exec(`UPDATE lots SET quantite_restante = -1 WHERE id = 1`), 'refuse')
check('sortie normale', () =>
  db.exec(`UPDATE lots SET quantite_restante = 90 WHERE id = 1`), 'accepte')

console.log('\n-- Caisse : une seule ouverte a la fois --')
check('ouverture 1re caisse', () =>
  db.exec(`INSERT INTO caisse_sessions(id,reference,utilisateur_id,fond_initial) VALUES (1,'C-001',1,50000)`), 'accepte')
check('ouverture 2e caisse pendant la 1re', () =>
  db.exec(`INSERT INTO caisse_sessions(id,reference,utilisateur_id,fond_initial) VALUES (2,'C-002',1,50000)`), 'refuse')
check('cloture puis nouvelle ouverture', () => {
  db.exec(`UPDATE caisse_sessions SET statut='fermee', fermee_at='2026-08-24T18:00:00Z' WHERE id=1`)
  db.exec(`INSERT INTO caisse_sessions(id,reference,utilisateur_id,fond_initial) VALUES (2,'C-002',1,50000)`)
}, 'accepte')

console.log('\n-- Ventes --')
check('quantite de vente nulle', () => {
  db.exec(`INSERT INTO ventes(id,reference,caisse_session_id,utilisateur_id,total) VALUES (1,'V-001',2,1,1500)`)
  db.exec(`INSERT INTO vente_lignes(vente_id,produit_id,lot_id,designation,quantite,prix_unitaire,montant)
           VALUES (1,1,1,'Doliprane 500 mg',0,1500,0)`)
}, 'refuse')
check('mode de paiement invente', () =>
  db.exec(`INSERT INTO vente_paiements(vente_id,mode,montant) VALUES (1,'bitcoin',1500)`), 'refuse')
check('paiement mixte especes + mobile money', () => {
  db.exec(`INSERT INTO vente_paiements(vente_id,mode,montant) VALUES (1,'especes',1000)`)
  db.exec(`INSERT INTO vente_paiements(vente_id,mode,montant) VALUES (1,'mobile_money',500)`)
}, 'accepte')

console.log('\n-- Recherche FTS5 (accents, casse, partiel) --')
const search = (t) => db.prepare(
  `SELECT p.nom_commercial FROM produits_fts f JOIN produits p ON p.id=f.rowid WHERE produits_fts MATCH ? LIMIT 3`).all(t)
for (const terme of ['doliprane', 'DOLIPRANE', 'paracetamol', 'paracétamol', 'dolip*']) {
  const r = search(terme)
  console.log('  ' + (r.length ? 'OK   ' : 'ECHEC') + ' | "' + terme + '" -> ' + (r.length ? r[0].nom_commercial : 'aucun resultat'))
  r.length ? pass++ : fail++
}

console.log('\n-- FEFO : ordre de sortie des lots --')
db.exec(`INSERT INTO lots(id,produit_id,numero,date_reception,date_peremption,quantite_initiale,quantite_restante,prix_achat) VALUES
  (2,1,'L-TARD','2026-01-10','2028-01-31',50,50,900),
  (3,1,'L-TOT','2026-05-01','2026-12-15',30,30,880),
  (4,1,'L-VIDE','2026-02-01','2026-09-30',20,0,880),
  (5,1,'L-BLOQ','2026-03-01','2026-10-05',40,40,880)`)
db.exec(`UPDATE lots SET bloque=1, motif_blocage='rappel laboratoire' WHERE id=5`)
const fefo = db.prepare(`SELECT numero, date_peremption, quantite_restante FROM lots
  WHERE produit_id=1 AND quantite_restante>0 AND bloque=0
  ORDER BY date_peremption IS NULL, date_peremption, id`).all()
console.log('  ordre obtenu : ' + fefo.map(l => l.numero + '(' + l.date_peremption + ')').join(' -> '))
const attendu = ['L-TOT','L-AAA','L-TARD']
const ordreOk = JSON.stringify(fefo.map(l => l.numero)) === JSON.stringify(attendu)
console.log('  ' + (ordreOk ? 'OK   ' : 'ECHEC') + ' | premier expire = premier sorti, lot vide et lot bloque exclus')
ordreOk ? pass++ : fail++

console.log('\n-- Vue etat du stock --')
const etat = db.prepare(`SELECT stock, stock_disponible, valeur_achat, prochaine_peremption, etat_stock FROM v_produit_etat WHERE id=1`).get()
console.log('  ' + JSON.stringify(etat))
const vueOk = etat.stock === 210 && etat.stock_disponible === 170 && etat.etat_stock === 'disponible'
console.log('  ' + (vueOk ? 'OK   ' : 'ECHEC') + ' | stock=210 total, 170 disponible (40 bloques exclus)')
vueOk ? pass++ : fail++

console.log('\n=== ' + pass + ' verifications reussies, ' + fail + ' echouees ===')
process.exit(fail ? 1 : 0)
