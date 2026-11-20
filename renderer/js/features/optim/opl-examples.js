// Bibliothèque de modèles OPL : cours « Optimisation BUT 3 » (CPLEX) et mémo de syntaxe.
// Chaque entrée = un ou plusieurs fichiers (.mod, .dat) créés dans le dossier Optimisation.
// Les modèles marqués « proposition » ne figurent pas tels quels dans le cours (énoncés d'exercices).

const OPL_EXAMPLE_GROUPS = [
  {
    group: 'Cours — CPLEX (BUT 3)',
    items: [
      {
        title: 'Plus court chemin (Dijkstra) — exemple 1',
        files: [
          { name: 'Dijkstra.mod', content:
`// Plus court chemin entre origine et destination (cours, diapos 9 à 15)
// x[i][j] = 1 si l'arc (i,j) fait partie du chemin
{string} noeuds=...;
string origine=...;
string destination=...;

int distances[noeuds][noeuds]=...;   // 0 = pas d'arc

dvar boolean x[noeuds][noeuds];

minimize sum(i in noeuds, j in noeuds) x[i][j]*distances[i][j];

subject to{
  // conservation du flot aux sommets intermédiaires
  forall(i in noeuds: i != origine && i!= destination) c1:
    sum(j in noeuds : distances[i][j] !=0) x[i][j] == sum(j in noeuds: distances[j][i] !=0) x[j][i];

  // un seul arc sort de l'origine, aucun n'y entre
  sum(j in noeuds: distances[origine][j] !=0) x[origine][j] == 1;
  sum(j in noeuds: distances[j][origine] !=0) x[j][origine] == 0;

  // un seul arc entre dans la destination, aucun n'en sort
  sum(j in noeuds: distances[destination][j] !=0) x[destination][j] == 0;
  sum(j in noeuds: distances[j][destination] !=0) x[j][destination] == 1;
}

// Affichage normalisé (diapo 14)
execute{
  var i=origine;
  for ( var j in noeuds)
  { for ( var k in noeuds)
    { if (x[i][k]==1)
      { write (i);
        i=k;
        if (i==destination)
          { write("->"); write(destination);
            break;
        }
        else write ("->")
      }
    }
  }
};
` },
          { name: 'Dijkstra.dat', content:
`noeuds={"S","a","b","c","d"};
origine="S";
destination="d";
distances=[[0 3 0 5 0],
[0 0 5 1 0],
[0 0 0 0 1],
[0 1 5 0 5],
[3 0 3 0 0]];
` }]
      },
      {
        title: 'Affectation (ressources / tâches)',
        files: [
          { name: 'Affectation.mod', content:
`// Problème d'affectation (cours, diapos 16 à 21)
{string} ressources=...;
{string} taches=...;
int couts[ressources][taches]=...;
dvar boolean x[ressources][taches];

minimize sum(i in ressources, j in taches) x[i][j]*couts[i][j];

subject to
{ forall(i in ressources) c1:     // une ressource traite une seule tâche
    sum (j in taches) x[i][j] == 1;

  forall(j in taches) c2:         // une tâche est traitée par une seule ressource
    sum (i in ressources) x[i][j] == 1;
}

execute{
  for(var i in ressources)
  for (var j in taches)
   if (x[i][j]==1)
    {write("ressource ",i);
     writeln(" traite la tache ",j);
    }
}
` },
          { name: 'Affectation.dat', content:
`ressources={"r1","r2","r3","r4","r5"};
taches={"t1","t2","t3","t4","t5"};
couts=[[17 15 9 5 12],
       [16 16 10 5 10],
       [12 15 14 11 5],
       [4 8 14 17 13],
       [13 9 8 12 17]];
` }]
      },
      {
        title: 'Sac à dos : 4 objets (énoncé du cours)',
        files: [
          { name: 'SacADos.mod', content:
`// Sac à dos 0-1 (cours, diapos 23-24) — proposition de correction
// max somme(v[i]*x[i])   sous   somme(p[i]*x[i]) <= pmax   avec x[i] binaire
int n = ...;
int pmax = ...;
range objets = 1..n;
int poids[objets] = ...;
int valeurs[objets] = ...;

dvar boolean x[objets];

maximize sum(i in objets) valeurs[i]*x[i];

subject to {
  capacite: sum(i in objets) poids[i]*x[i] <= pmax;
}

// affichage personnalisé : uniquement la liste des objets sélectionnés
execute {
  write("Objets selectionnes :");
  for (var i in objets) if (x[i] == 1) write(" ", i);
  writeln();
}
` },
          { name: 'SacADos.dat', content:
`n = 4;
poids = [5 7 4 3];
valeurs = [16 22 12 8];
pmax = 14;
` }]
      },
      {
        title: 'Voyageur de commerce (exercice TSP, graphe s-a-b-c-d)',
        files: [
          { name: 'TSP.mod', content:
`// Voyageur de commerce, circuit hamiltonien de coût minimal (cours, diapos 25-26)
// Proposition de correction : affectation + élimination des sous-tours (Miller-Tucker-Zemlin)
{string} villes = ...;
string depart = ...;
int cout[villes][villes] = ...;      // 0 = pas d'arc
int n = card(villes);

dvar boolean x[villes][villes];      // x[i][j] = 1 si j est visitée juste après i
dvar int+ u[villes];                 // rang de visite (pour interdire les sous-tours)

minimize sum(i in villes, j in villes : cout[i][j] != 0) cout[i][j] * x[i][j];

subject to {
  forall(i in villes, j in villes : cout[i][j] == 0)
    pas_arc: x[i][j] == 0;
  forall(i in villes) sortant:
    sum(j in villes : cout[i][j] != 0) x[i][j] == 1;
  forall(j in villes) entrant:
    sum(i in villes : cout[i][j] != 0) x[i][j] == 1;
  forall(i in villes, j in villes : i != depart && j != depart && j != i && cout[i][j] != 0)
    mtz: u[i] - u[j] + n * x[i][j] <= n - 1;
  forall(i in villes : i != depart) {
    rang_min: u[i] >= 1;
    rang_max: u[i] <= n - 1;
  }
}

execute {
  var i = depart;
  write(i);
  for (var k in villes) {
    for (var j in villes) {
      if (x[i][j] == 1) { i = j; write("->", i); break; }
    }
    if (i == depart) break;
  }
  writeln();
}
` },
          { name: 'TSP.dat', content:
`// ordre des colonnes : s, a, b, c, d
villes = {"s","a","b","c","d"};
depart = "s";
cout = [[0 3 0 5 0],
        [0 0 5 1 0],
        [0 0 0 0 1],
        [0 1 5 0 5],
        [3 0 3 0 0]];
` }]
      },
      {
        title: 'Branch & Bound — exemple 1 (sac à dos 16,22,12,8)',
        files: [{ name: 'BB1.mod', content:
`// Branch & Bound, exemple 1 (cours, diapo 29)
dvar boolean x1;
dvar boolean x2;
dvar boolean x3;
dvar boolean x4;

maximize 16*x1 + 22*x2 + 12*x3 + 8*x4;

subject to {
  5*x1 + 7*x2 + 4*x3 + 3*x4 <= 14;
}
` }]
      },
      {
        title: 'Branch & Bound — exemple 2 (x1, x2 entiers)',
        files: [{ name: 'BB2.mod', content:
`// Branch & Bound, exemple 2 (cours, diapo 29)
dvar int+ x1;
dvar int+ x2;

maximize 3*x1 + 4*x2;

subject to {
  2*x1 + x2 <= 6;
  2*x1 + 3*x2 <= 9;
}
` }]
      },
      {
        title: 'Branch & Bound — exercice 1 (binaire)',
        files: [{ name: 'BB_exercice1.mod', content:
`// Branch & Bound, exercice 1 (cours, diapo 30)
// Racine de l'arbre (relaxation) : x = (1, 1, 0.5, 0), z = 22
dvar boolean x1;
dvar boolean x2;
dvar boolean x3;
dvar boolean x4;

maximize 8*x1 + 11*x2 + 6*x3 + 4*x4;

subject to {
  5*x1 + 7*x2 + 4*x3 + 3*x4 <= 14;
}
` }]
      },
      {
        title: 'Branch & Bound — exercice 2 (entiers)',
        files: [{ name: 'BB_exercice2.mod', content:
`// Branch & Bound, exercice 2 (cours, diapo 30)
dvar int+ x1;
dvar int+ x2;

maximize 5*x1 + 6*x2;

subject to {
  x1 + x2 <= 5;
  4*x1 + 7*x2 <= 28;
}
` }]
      }
    ]
  },
  {
    group: 'Bases',
    items: [
      {
        title: 'Fromages (un seul fichier)',
        files: [{ name: 'fromages.mod', content:
`dvar int x; // aoc
dvar int y; // fromage 2

maximize 3000*x + 1000*y;

subject to {
  30*x + 15*y <= 21000; // contrainte horaire
  10000*x <= 4000000;
  7500*y <= 6000000;
}

execute {
  writeln(30, "*", x, " + ", 15, "*", y, " <= ", 21000);
}
` }]
      },
      {
        title: 'Production avec données (.mod + .dat)',
        files: [
          { name: 'production.mod', content:
`{string} Produits = ...;
range Ressources = 1..2;

float profit[Produits] = ...;
float conso[Ressources][Produits] = ...;
float dispo[Ressources] = ...;

dvar float+ q[Produits];

maximize sum(p in Produits) profit[p] * q[p];

subject to {
  forall(r in Ressources)
    capacite: sum(p in Produits) conso[r][p] * q[p] <= dispo[r];
}

execute {
  for (var p in Produits) writeln(p, " : ", q[p]);
}
` },
          { name: 'production.dat', content:
`Produits = {"A", "B"};
profit = [3 2];
conso = [[2 1]
         [1 3]];
dispo = [18 24];
` }]
      },
      {
        title: 'Mémo de syntaxe OPL (exécutable)',
        files: [{ name: 'memo-syntaxe.mod', content:
`/* MÉMO DE SYNTAXE OPL — ce fichier s'exécute tel quel */

// ---- Données --------------------------------------------------
int n = 3;                          // entier
float taux = 0.5;                   // réel
string nom = "exemple";             // chaîne
range I = 1..n;                     // intervalle 1,2,3
{string} Villes = {"A","B","C"};    // ensemble de chaînes
int poids[I] = [4, 3, 2];           // tableau indexé par un intervalle
int dist[Villes][Villes] = [[0,2,5],[2,0,3],[5,3,0]];   // matrice
// int d[I] = ...;  → la valeur est lue dans le fichier .dat : d = [1 2 3];

// ---- Variables de décision ----------------------------------------
dvar boolean b[I];                  // 0 ou 1
dvar int+ k;                        // entier >= 0
dvar float+ f;                      // réel >= 0
dvar int m in 0..10;                // entier borné
dvar float z;                       // réel de signe quelconque

// ---- Objectif ---------------------------------------------------------
maximize sum(i in I) poids[i]*b[i] + k + f + z + m;    // ou : minimize ...

// ---- Contraintes ------------------------------------------------------
subject to {
  limite: sum(i in I) poids[i]*b[i] <= 6;           // contrainte étiquetée
  forall(i in I) lien: b[i] <= k;                   // une contrainte par i
  forall(i in I: i != 2) b[i] + k <= 4;             // avec condition
  1 <= k + f <= 8;                                  // contrainte double (encadrement)
  -5 <= z;  z <= 5;                                 // z peut être négatif
  m + k <= 12;
}

// ---- Affichage (exécuté après la résolution) ---------------------------
execute {
  writeln("k = ", k, "  f = ", f);
  for (var i in I) if (b[i] == 1) write("objet ", i, " ");
  writeln();
  for (var v in Villes) writeln(v, " -> distance a A : ", dist["A"][v]);
}
` }]
      }
    ]
  }
];
