/* GENERATED from ohara/data/definitions.json by tools/build_definitions.py - do not edit by hand. */
(function (root) {
  var DATA = {
 "_comment": "Single source of truth for the scientific definitions shared by the Python package and the browser engine. Edit here, then run: python tools/build_definitions.py",
 "_ignored_components": "recognised oxides/elements that this model does not use: accepted, excluded, and listed in the assumptions",
 "_metadata_columns": "CSV columns (case-insensitive) that describe a sample rather than hold an oxide; loaders skip them without complaint. The first of label/sample/sample name/name/id/no is used as the sample label.",
 "_units": "basalt_endmembers.f are formula units of the vertices Di=CaMgSi2O6, Ol=Mg2SiO4, Ne=Na2O.Al2O3.2SiO2 (two NaAlSiO4), Qz=SiO2; so one albite unit Na2O.Al2O3.6SiO2 = 1 Ne + 4 Qz and one Mg2Si2O6 = 1 Ol + 1 Qz",
 "aliases": {
  "al2o3": "Al2O3",
  "cao": "CaO",
  "co2": "CO2",
  "cr2o3": "Cr2O3",
  "fe2o3": "Fe2O3",
  "fe2o3(t)": "Fe2O3*",
  "fe2o3*": "Fe2O3*",
  "fe2o3t": "Fe2O3*",
  "feo": "FeO",
  "feo(t)": "FeO*",
  "feo*": "FeO*",
  "feot": "FeO*",
  "feotot": "FeO*",
  "feototal": "FeO*",
  "h2o": "H2O",
  "h2o+": "H2O",
  "h2o-": "H2O",
  "h2o_minus": "H2O",
  "h2o_plus": "H2O",
  "k2o": "K2O",
  "loi": "H2O",
  "mgo": "MgO",
  "mno": "MnO",
  "na2o": "Na2O",
  "nio": "NiO",
  "p2o5": "P2O5",
  "sio2": "SiO2",
  "tio2": "TiO2"
 },
 "basalt_endmembers": {
  "Ab": {
   "f": [
    0,
    0,
    1,
    4
   ],
   "name": "albite (NaAlSi3O8 = NaAlSiO4 + 2 SiO2)"
  },
  "Di": {
   "f": [
    1,
    0,
    0,
    0
   ],
   "name": "diopside (clinopyroxene)"
  },
  "Hy": {
   "f": [
    0,
    1,
    0,
    1
   ],
   "name": "hypersthene (Mg2Si2O6 = Mg2SiO4 + SiO2)"
  },
  "Ne": {
   "f": [
    0,
    0,
    1,
    0
   ],
   "name": "nepheline"
  },
  "Ol": {
   "f": [
    0,
    1,
    0,
    0
   ],
   "name": "olivine"
  },
  "Qz": {
   "f": [
    0,
    0,
    0,
    1
   ],
   "name": "quartz (silica)"
  }
 },
 "basalt_planes": [
  {
   "id": "critical_undersaturation",
   "label": "critical plane of silica undersaturation (Cpx-Ol-Pl)",
   "neg": "alkalic side (critically undersaturated)",
   "plane": [
    "Di",
    "Ol",
    "Ab"
   ],
   "pos": "tholeiitic side (silica-saturated)",
   "ref": "Qz"
  },
  {
   "id": "silica_saturation",
   "label": "plane of silica saturation (Cpx-Opx-Pl)",
   "neg": "olivine-normative (undersaturated)",
   "plane": [
    "Di",
    "Hy",
    "Ab"
   ],
   "pos": "quartz-normative (oversaturated)",
   "ref": "Qz"
  }
 ],
 "basalt_vertex_weights": [
  216.5504,
  140.6931,
  284.1088,
  60.0843
 ],
 "cmas_endmembers": {
  "A": {
   "f": [
    0,
    0,
    1,
    0
   ],
   "name": "corundum (Al2O3)"
  },
  "A2S3": {
   "f": [
    0,
    0,
    2,
    3
   ],
   "name": "A2S3 (Al2O3.1.5SiO2 pseudo-component)"
  },
  "C": {
   "f": [
    1,
    0,
    0,
    0
   ],
   "name": "lime (CaO)"
  },
  "C2S": {
   "f": [
    2,
    0,
    0,
    1
   ],
   "name": "larnite (Ca2SiO4)"
  },
  "C2S3": {
   "f": [
    2,
    0,
    0,
    3
   ],
   "name": "C2S3 (CaO.1.5SiO2 pseudo-component)"
  },
  "C3A": {
   "f": [
    3,
    0,
    1,
    0
   ],
   "name": "C3A (3CaO.Al2O3)"
  },
  "C3AS3": {
   "f": [
    3,
    0,
    1,
    3
   ],
   "name": "grossular (Ca3Al2Si3O12)"
  },
  "C3S": {
   "f": [
    3,
    0,
    0,
    1
   ],
   "name": "Ca3SiO5"
  },
  "CA2S2": {
   "f": [
    1,
    0,
    2,
    2
   ],
   "name": "CaAl4Si2O10 (Ca-Al pseudo-component)"
  },
  "CAS": {
   "f": [
    1,
    0,
    1,
    1
   ],
   "name": "Ca-Tschermak's molecule (CaAl2SiO6)"
  },
  "CAS2": {
   "f": [
    1,
    0,
    1,
    2
   ],
   "name": "anorthite / plagioclase (CaAl2Si2O8)"
  },
  "CMS": {
   "f": [
    1,
    1,
    0,
    1
   ],
   "name": "monticellite (CaMgSiO4)"
  },
  "CMS2": {
   "f": [
    1,
    1,
    0,
    2
   ],
   "name": "diopside (CaMgSi2O6)"
  },
  "CS": {
   "f": [
    1,
    0,
    0,
    1
   ],
   "name": "wollastonite (CaSiO3)"
  },
  "M": {
   "f": [
    0,
    1,
    0,
    0
   ],
   "name": "periclase (MgO)"
  },
  "M2A2S5": {
   "f": [
    0,
    2,
    2,
    5
   ],
   "name": "cordierite (Mg2Al4Si5O18)"
  },
  "M2S": {
   "f": [
    0,
    2,
    0,
    1
   ],
   "name": "olivine / forsterite (Mg2SiO4)"
  },
  "M3AS3": {
   "f": [
    0,
    3,
    1,
    3
   ],
   "name": "pyrope (Mg3Al2Si3O12)"
  },
  "MA": {
   "f": [
    0,
    1,
    1,
    0
   ],
   "name": "spinel (MgAl2O4)"
  },
  "MS": {
   "f": [
    0,
    1,
    0,
    1
   ],
   "name": "orthopyroxene / enstatite (MgSiO3)"
  },
  "S": {
   "f": [
    0,
    0,
    0,
    1
   ],
   "name": "silica (SiO2, quartz)"
  }
 },
 "cmas_planes": [
  {
   "id": "critical_undersaturation",
   "label": "critical plane of silica undersaturation (Di-Ol-An)",
   "neg": "critically undersaturated side (beyond Di-Ol-An)",
   "plane": [
    "CMS2",
    "M2S",
    "CAS2"
   ],
   "pos": "silica-saturated side of Di-Ol-An",
   "ref": "S"
  },
  {
   "id": "silica_saturation",
   "label": "plane of silica saturation (Di-Hy-An)",
   "neg": "olivine-normative side of Di-Hy-An",
   "plane": [
    "CMS2",
    "MS",
    "CAS2"
   ],
   "pos": "quartz-normative side of Di-Hy-An",
   "ref": "S"
  },
  {
   "id": "opx_control",
   "label": "orthopyroxene control plane (Opx-An-Di)",
   "neg": "silica side of the Opx control plane",
   "plane": [
    "MS",
    "CAS2",
    "CMS2"
   ],
   "pos": "olivine side of the Opx control plane",
   "ref": "M2S"
  },
  {
   "id": "ol_gt_opx",
   "label": "olivine-garnet-orthopyroxene control plane",
   "neg": "away from diopside across Ol-Gt-Opx",
   "plane": [
    "M2S",
    "M3AS3",
    "MS"
   ],
   "pos": "diopside side of the Ol-Gt-Opx plane",
   "ref": "CMS2"
  },
  {
   "id": "plag_lherzolite",
   "label": "olivine-plagioclase-orthopyroxene plane",
   "neg": "away from diopside across Ol-Pl-Opx",
   "plane": [
    "M2S",
    "CAS2",
    "MS"
   ],
   "pos": "diopside side of Ol-Pl-Opx",
   "ref": "CMS2"
  }
 ],
 "extra_molar_mass": {
  "CaF2": 78.0748
 },
 "ignored_components": [
  "SrO",
  "BaO",
  "SO3",
  "S",
  "F",
  "Cl",
  "Li2O",
  "Rb2O",
  "Cs2O",
  "B2O3",
  "ZrO2",
  "V2O3",
  "V2O5",
  "CoO",
  "ZnO",
  "CuO",
  "Sc2O3",
  "Y2O3",
  "La2O3",
  "Ce2O3",
  "ThO2",
  "UO2",
  "HfO2",
  "Nb2O5",
  "Ta2O5",
  "PbO",
  "SnO2"
 ],
 "metadata_columns": [
  "label",
  "sample",
  "sample name",
  "name",
  "id",
  "no",
  "no.",
  "rock",
  "rock type",
  "locality",
  "location",
  "source",
  "reference",
  "citation",
  "notes",
  "note",
  "comment",
  "comments",
  "total",
  "sum",
  "investigated",
  "group",
  "type",
  "date",
  "latitude",
  "longitude",
  "lat",
  "lon"
 ],
 "molar_mass": {
  "Al2O3": 101.9613,
  "CO2": 44.0095,
  "CaO": 56.0774,
  "Cr2O3": 151.9902,
  "Fe2O3": 159.6882,
  "FeO": 71.8444,
  "H2O": 18.0153,
  "K2O": 94.196,
  "MgO": 40.3044,
  "MnO": 70.9374,
  "Na2O": 61.9789,
  "NiO": 74.6928,
  "P2O5": 141.9445,
  "SiO2": 60.0843,
  "TiO2": 79.8658
 },
 "norm_recipes": {
  "_comment": "oxide formula units per normative 'molecule' as used in the CIPW calculation; weights are computed from molar_mass in both engines",
  "albite": {
   "Al2O3": 1,
   "Na2O": 1,
   "SiO2": 6
  },
  "anorthite": {
   "Al2O3": 1,
   "CaO": 1,
   "SiO2": 2
  },
  "apatite": {
   "CaF2": 0.3333333333333333,
   "CaO": 3,
   "P2O5": 1
  },
  "chromite": {
   "Cr2O3": 1,
   "FeO": 1
  },
  "corundum": {
   "Al2O3": 1
  },
  "di_fe": {
   "CaO": 1,
   "FeO": 1,
   "SiO2": 2
  },
  "di_mg": {
   "CaO": 1,
   "MgO": 1,
   "SiO2": 2
  },
  "enstatite": {
   "MgO": 1,
   "SiO2": 1
  },
  "fayalite": {
   "FeO": 2,
   "SiO2": 1
  },
  "ferrosilite": {
   "FeO": 1,
   "SiO2": 1
  },
  "forsterite": {
   "MgO": 2,
   "SiO2": 1
  },
  "hematite": {
   "Fe2O3": 1
  },
  "ilmenite": {
   "FeO": 1,
   "TiO2": 1
  },
  "kalsilite": {
   "Al2O3": 1,
   "K2O": 1,
   "SiO2": 2
  },
  "larnite": {
   "CaO": 2,
   "SiO2": 1
  },
  "leucite": {
   "Al2O3": 1,
   "K2O": 1,
   "SiO2": 4
  },
  "magnetite": {
   "Fe2O3": 1,
   "FeO": 1
  },
  "nepheline": {
   "Al2O3": 1,
   "Na2O": 1,
   "SiO2": 2
  },
  "orthoclase": {
   "Al2O3": 1,
   "K2O": 1,
   "SiO2": 6
  },
  "quartz": {
   "SiO2": 1
  },
  "rutile": {
   "TiO2": 1
  },
  "wollastonite": {
   "CaO": 1,
   "SiO2": 1
  }
 },
 "ohara_multipliers": {
  "A": 101.96,
  "C": 56.08,
  "M": 40.31,
  "S": 60.09
 },
 "projections": [
  {
   "basis": [
    "CS",
    "MS",
    "A"
   ],
   "id": "cmas_ol_CS_MS_A",
   "note": "the standard basalt/gabbro projection; plagioclase plots inside the triangle, clinopyroxene on the CS-MS side",
   "points": [
    "M2S"
   ],
   "source": "O'Hara (1968) Fig.4 and Fig.9",
   "space": "cmas",
   "title": "from olivine (M2S) into CS-MS-A"
  },
  {
   "basis": [
    "M2S",
    "C2S3",
    "A2S3"
   ],
   "id": "cmas_opx_M2S_C2S3_A2S3",
   "note": "contains the olivine-diopside-pyrope plane; the peridotite projection",
   "points": [
    "MS"
   ],
   "source": "O'Hara (1968) Fig.5 and Fig.10",
   "space": "cmas",
   "title": "from orthopyroxene (MS) into M2S-C2S3-A2S3"
  },
  {
   "basis": [
    "C3A",
    "S",
    "M"
   ],
   "id": "cmas_di_C3A_S_M",
   "note": "the plane olivine-E''-H'' is virtually coplanar with C3A-S-M",
   "points": [
    "CMS2"
   ],
   "source": "O'Hara (1968) Fig.11",
   "space": "cmas",
   "title": "from diopside (CMS2) into C3A-SiO2-MgO"
  },
  {
   "basis": [
    "M2S",
    "CMS2",
    "S"
   ],
   "id": "cmas_an_M2S_CMS2_S",
   "note": "the pseudo-ternary in which low-pressure gabbroic cotectics are usually drawn",
   "points": [
    "CAS2"
   ],
   "source": "O'Hara-type sub-projection of the basalt tetrahedron",
   "space": "cmas",
   "title": "from plagioclase (CAS2) into olivine-diopside-silica"
  },
  {
   "basis": [
    "M2S",
    "CAS2",
    "S"
   ],
   "id": "cmas_di_M2S_CAS2_S",
   "points": [
    "CMS2"
   ],
   "source": "O'Hara-type sub-projection",
   "space": "cmas",
   "title": "from diopside (CMS2) into olivine-anorthite-silica"
  },
  {
   "basis": [
    "CMS2",
    "CAS2",
    "S"
   ],
   "id": "cmas_ol_CMS2_CAS2_S",
   "points": [
    "M2S"
   ],
   "source": "O'Hara-type sub-projection",
   "space": "cmas",
   "title": "from olivine (M2S) into diopside-anorthite-silica"
  },
  {
   "basis": [
    "M2S",
    "CMS2",
    "CAS2"
   ],
   "id": "cmas_s_M2S_CMS2_CAS2",
   "points": [
    "S"
   ],
   "source": "O'Hara-type sub-projection",
   "space": "cmas",
   "title": "from silica (S) into olivine-diopside-anorthite"
  },
  {
   "basis": [
    "CS",
    "A"
   ],
   "id": "cmas_ol_CS_MS_A_join",
   "note": "binary section: the CS/A ratio after removing olivine and orthopyroxene control",
   "points": [
    "M2S",
    "MS"
   ],
   "source": "sub-projection within Fig.4",
   "space": "cmas",
   "title": "double projection from olivine + orthopyroxene onto CS-A"
  },
  {
   "basis": [
    "CMS2",
    "S"
   ],
   "id": "cmas_ol_pl_join",
   "points": [
    "M2S",
    "CAS2"
   ],
   "source": "sub-projection of the gabbro system",
   "space": "cmas",
   "title": "double projection from olivine + plagioclase onto Di-SiO2"
  },
  {
   "basis": [
    "Ol",
    "Ne",
    "Qz"
   ],
   "id": "basalt_di_Ol_Ne_Qz",
   "note": "albite lies on the Ne-Qz edge at Ne + 2Qz, hypersthene on the Ol-Qz edge",
   "points": [
    "Di"
   ],
   "source": "Yoder & Tilley (1962) basalt tetrahedron, base face",
   "space": "basalt",
   "title": "from diopside into olivine-nepheline-silica"
  },
  {
   "basis": [
    "Di",
    "Ne",
    "Qz"
   ],
   "id": "basalt_ol_Di_Ne_Qz",
   "points": [
    "Ol"
   ],
   "source": "Yoder & Tilley (1962) basalt tetrahedron",
   "space": "basalt",
   "title": "from olivine into diopside-nepheline-silica"
  },
  {
   "basis": [
    "Di",
    "Ol",
    "Qz"
   ],
   "id": "basalt_ne_Di_Ol_Qz",
   "points": [
    "Ne"
   ],
   "source": "Yoder & Tilley (1962) basalt tetrahedron",
   "space": "basalt",
   "title": "from nepheline into diopside-olivine-silica"
  },
  {
   "basis": [
    "Di",
    "Ol",
    "Ne"
   ],
   "id": "basalt_qz_Di_Ol_Ne",
   "points": [
    "Qz"
   ],
   "source": "Yoder & Tilley (1962) basalt tetrahedron",
   "space": "basalt",
   "title": "from silica into diopside-olivine-nepheline"
  },
  {
   "basis": [
    "Di",
    "Ol",
    "Qz"
   ],
   "id": "basalt_ab_Di_Ol_Qz",
   "note": "the usual way of viewing the critical plane of silica undersaturation face-on",
   "points": [
    "Ab"
   ],
   "source": "projection from the plagioclase vertex of the tetrahedron",
   "space": "basalt",
   "title": "from albite (plagioclase) into diopside-olivine-silica"
  },
  {
   "basis": [
    "Ol",
    "Qz"
   ],
   "id": "basalt_ab_di_join",
   "points": [
    "Ab",
    "Di"
   ],
   "source": "binary section across the planes of the tetrahedron",
   "space": "basalt",
   "title": "double projection from albite + diopside onto Ol-Qz"
  }
 ],
 "validation": {
  "total_max": 102.0,
  "total_min": 97.0
 }
};
  if (typeof module === "object" && module.exports) module.exports = DATA;
  else root.OHARA_DEFS = DATA;
}(typeof self !== "undefined" ? self : this));
