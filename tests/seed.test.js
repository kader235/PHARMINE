const fs = require('node:fs')
const Database = require('better-sqlite3-multiple-ciphers')
const db = new Database(':memory:')
db.exec('PRAGMA foreign_keys = ON')
db.exec(fs.readFileSync('src/main/db/schema.sql', 'utf8'))
try { db.exec(fs.readFileSync('src/main/db/seed.sql', 'utf8')) }
catch (e) { console.log('ECHEC seed :: ' + e.message); process.exit(1) }

const one = (s, ...p) => db.prepare(s).get(...p)
const all = (s, ...p) => db.prepare(s).all(...p)
let fail = 0
const dire = (ok, txt) => { console.log((ok ? '  OK   ' : '  ECHEC') + ' | ' + txt); if (!ok) fail++ }

console.log('-- Referentiel --')
for (const [t, min] of [['roles',4],['permissions',40],['formes',18],['unites',8],['categories',6],['depense_categories',9],['parametres',13]]) {
  const n = one('SELECT COUNT(*) n FROM ' + t).n
  dire(n >= min, t + ' = ' + n + ' lignes')
}

console.log('\n-- Aucune donnee fictive dans une base neuve --')
for (const t of ['produits','fournisseurs','clients','ventes','achats','lots','depenses','utilisateurs','mouvements_stock','alertes']) {
  const n = one('SELECT COUNT(*) n FROM ' + t).n
  dire(n === 0, t + ' est vide (' + n + ')')
}

console.log('\n-- Permissions par role --')
const total = one('SELECT COUNT(*) n FROM permissions').n
for (const r of all('SELECT r.id, r.nom, COUNT(rp.permission_code) n FROM roles r LEFT JOIN role_permissions rp ON rp.role_id=r.id GROUP BY r.id ORDER BY r.id')) {
  console.log('  ' + r.nom.padEnd(16) + ' ' + String(r.n).padStart(2) + '/' + total + ' permissions')
}
dire(one('SELECT COUNT(*) n FROM role_permissions WHERE role_id=1').n === total, 'administrateur a toutes les permissions')

const caissierPeut = (code) => !!one('SELECT 1 x FROM role_permissions WHERE role_id=3 AND permission_code=?', code)
dire(caissierPeut('ventes.creer'),        'le caissier peut vendre')
dire(caissierPeut('caisse.ouvrir'),       'le caissier peut ouvrir la caisse')
dire(!caissierPeut('produits.prix'),      'le caissier ne peut pas changer un prix')
dire(!caissierPeut('stock.ajuster'),      'le caissier ne peut pas ajuster le stock')
dire(!caissierPeut('utilisateurs.gerer'), 'le caissier ne peut pas gerer les utilisateurs')
dire(!caissierPeut('ventes.remise'),      'le caissier ne peut pas appliquer de remise')

const pharmacienPeut = (code) => !!one('SELECT 1 x FROM role_permissions WHERE role_id=2 AND permission_code=?', code)
dire(pharmacienPeut('stock.ajuster'),          'le pharmacien peut ajuster le stock')
dire(pharmacienPeut('inventaire.valider'),     'le pharmacien peut valider un inventaire')
dire(!pharmacienPeut('utilisateurs.permissions'), 'le pharmacien ne peut pas modifier les permissions')
dire(!pharmacienPeut('sauvegardes.restaurer'), 'le pharmacien ne peut pas restaurer une sauvegarde')

const gestionnairePeut = (code) => !!one('SELECT 1 x FROM role_permissions WHERE role_id=4 AND permission_code=?', code)
dire(gestionnairePeut('rapports.exporter'), 'le gestionnaire peut exporter un rapport')
dire(!gestionnairePeut('ventes.creer'),     'le gestionnaire ne peut pas vendre')
dire(!gestionnairePeut('caisse.ouvrir'),    'le gestionnaire ne touche pas a la caisse')

console.log('\n-- Surcharge individuelle de permission --')
db.exec(`INSERT INTO utilisateurs(id,code,identifiant,nom_complet,mot_de_passe_hash,mot_de_passe_sel,mot_de_passe_iter,role_id)
         VALUES (1,'U001','jean','Jean Kouassi','h','s',1,3)`)
db.exec(`INSERT INTO utilisateur_permissions(utilisateur_id,permission_code,accordee) VALUES (1,'ventes.remise',1)`)
const RESOLUTION = `
  SELECT CASE WHEN up.accordee IS NOT NULL THEN up.accordee
              WHEN rp.permission_code IS NOT NULL THEN 1 ELSE 0 END AS autorise
  FROM utilisateurs u
  LEFT JOIN role_permissions rp ON rp.role_id = u.role_id AND rp.permission_code = :code
  LEFT JOIN utilisateur_permissions up ON up.utilisateur_id = u.id AND up.permission_code = :code
  WHERE u.id = :uid`
const peut = (uid, code) => one(RESOLUTION, { uid, code }).autorise === 1
dire(peut(1, 'ventes.remise'), 'permission accordee individuellement au caissier')
dire(peut(1, 'ventes.creer'),  'permissions du role toujours actives')
db.exec(`INSERT INTO utilisateur_permissions(utilisateur_id,permission_code,accordee) VALUES (1,'ventes.creer',0)`)
dire(!peut(1, 'ventes.creer'), 'permission retiree individuellement, malgre le role')

console.log('\n=== ' + (fail ? fail + ' echec(s)' : 'toutes les verifications reussies') + ' ===')
process.exit(fail ? 1 : 0)
