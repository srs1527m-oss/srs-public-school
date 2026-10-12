// CBSE and UP Board practical lists for Classes IX to XII, session 2026-27 (wording shortened).
'use strict';
/* ---------- Practical lists, session 2026-27 (wording shortened). CBSE first, UP Board after. ---------- */
// A class key is the class number for CBSE ('12') and the same with a "u" prefix for UP Board ('u12').
// ROMAN gives the label shown everywhere: board plus class.
const ROMAN = { '9':'CBSE IX', '10':'CBSE X', '11':'CBSE XI', '12':'CBSE XII', 'u9':'UP IX', 'u10':'UP X', 'u11':'UP XI', 'u12':'UP XII' };
const BOARDS = { cbse:'CBSE', up:'UP Board' };
const boardOf = key => key[0] === 'u' ? 'up' : 'cbse';
const rawCls = key => key.replace(/^u/, '');
const classKey = (board, cls) => (board === 'up' ? 'u' : '') + cls;
const numOf = (g, i) => (g.start || 1) + i;
const UP_PHY_NOTE = 'UP Board lists 20 experiments in two sections; the exam sets one from each. 30 marks: two experiments 10, viva 5, practical record 4, project and viva 8, continuous assessment 3.';
const SUBJ = {
  science:{ name:'Science', color:'var(--sci)' },
  physics:{ name:'Physics', color:'var(--phy)' },
  chemistry:{ name:'Chemistry', color:'var(--chem)' },
  biology:{ name:'Biology', color:'var(--bio)' }
};
const PHY_NOTE = 'The record needs at least 8 experiments (4 from each section) and 6 activities (3 from each section), plus an investigatory project. Practical exam: 30 marks.';
const CHEM_NOTE = 'Practical exam, 30 marks: volumetric analysis 8, salt analysis 8, content-based experiment 6, project 4, class record and viva 4.';
const BIO_NOTE = 'Practical exam, 30 marks: major experiment 5, minor experiment 4, slide preparation 5, spotting 7, record and viva 4, project and viva 5.';

const SYL = {
  '9': { science: { note:'13 experiments, to be done alongside the theory chapters. Practical work counts for 5 marks of internal assessment (Subject Enrichment).', groups:[
    { k:'E', name:'Experiments', items:[
      'True solution, suspension and colloid: prepare and compare (transparency, filtration, stability, Tyndall effect)',
      'Separating mixtures: separating funnel, paper chromatography, sublimation, coagulation with alum',
      'Verify the law of conservation of mass in a chemical reaction',
      'Stained temporary mounts of onion peel / Rhoeo leaf and human cheek cells',
      'Identify plant tissues (parenchyma, collenchyma, sclerenchyma) and animal muscle fibres from prepared slides',
      'Budding in yeast and Hydra; spore formation in bread mould (prepared slides)',
      'Parts of a typical bisexual flower',
      'Identify specimens: Spirogyra, mushroom, moss, fern, pine cone; Amoeba, Hydra, tapeworm, Ascaris, earthworm, butterfly, snail, starfish',
      'Verify conservation of energy using a simple pendulum',
      'Speed of a pulse through a stretched string / slinky',
      'Mechanical advantage of a lever (M.A. = load / effort)',
      'Verify Newton\'s second law using a trolley, pulley and hanging masses',
      'Distance-time and velocity-time graphs using an inclined plane'
    ]}
  ]}},
  '10': { science: { note:'14 experiments in the CBSE list for Class X.', groups:[
    { k:'E', name:'Experiments', items:[
      'pH of given samples with pH paper / universal indicator; acid and base properties of HCl and NaOH (litmus, zinc, sodium carbonate)',
      'Classify four reactions: combination, decomposition, displacement, double displacement',
      'Action of Zn, Fe, Cu and Al on salt solutions; arrange the metals by reactivity',
      'Ohm\'s law: V-I dependence across a resistor, its resistance and the V-I graph',
      'Equivalent resistance of two resistors in series and in parallel',
      'Temporary mount of a leaf peel to show stomata',
      'Show that carbon dioxide is given out during respiration',
      'Properties of ethanoic acid: odour, solubility, effect on litmus, reaction with sodium hydrogen carbonate',
      'Cleaning capacity of soap in soft and hard water',
      'Focal length of a concave mirror and a convex lens using a distant object',
      'Path of a light ray through a rectangular glass slab; angles of incidence, refraction and emergence',
      'Binary fission in Amoeba; budding in yeast and Hydra (prepared slides)',
      'Path of light rays through a glass prism',
      'Parts of the embryo of a dicot seed (pea, gram or red kidney bean)'
    ]}
  ]}},
  '11': {
    physics: { note:PHY_NOTE, groups:[
      { k:'AE', name:'Section A · Experiments', need:4, items:[
        'Vernier calipers: diameter of a small sphere / cylinder; internal diameter, depth and volume of a beaker / calorimeter',
        'Screw gauge: diameter of a wire and thickness of a sheet',
        'Screw gauge: volume of an irregular lamina',
        'Spherometer: radius of curvature of a spherical surface',
        'Beam balance: masses of two different objects',
        'Weight of a body using the parallelogram law of vectors',
        'Simple pendulum: L-T² graph and effective length of a seconds pendulum',
        'Simple pendulum: time period against mass of the bob (same size, different masses)',
        'Limiting friction against normal reaction; coefficient of friction between a block and a horizontal surface',
        'Downward force on a roller along an inclined plane; force against sin θ graph'
      ]},
      { k:'AA', name:'Section A · Activities', need:3, items:[
        'Make a paper scale of a given least count (0.2 cm, 0.5 cm)',
        'Mass of a body using a metre scale by the principle of moments',
        'Plot a graph for given data with a proper scale and error bars',
        'Force of limiting friction for a roller rolling on a horizontal plane',
        'Range of a projectile against angle of projection',
        'Conservation of energy of a ball rolling down a double inclined plane',
        'Dissipation of energy of a simple pendulum: square of amplitude against time'
      ]},
      { k:'BE', name:'Section B · Experiments', need:4, items:[
        'Young\'s modulus of the material of a wire',
        'Force constant of a helical spring from a load-extension graph',
        'Volume against pressure of air at constant temperature: P-V and P-1/V graphs',
        'Surface tension of water by capillary rise',
        'Coefficient of viscosity of a liquid from the terminal velocity of a spherical body',
        'Cooling curve: temperature of a hot body against time',
        'Specific heat capacity of a solid by the method of mixtures',
        'Sonometer: frequency against length of a wire at constant tension',
        'Sonometer: length of a wire against tension at constant frequency',
        'Speed of sound in air at room temperature using a resonance tube (two resonance positions)'
      ]},
      { k:'BA', name:'Section B · Activities', need:3, items:[
        'Change of state and cooling curve for molten wax',
        'Effect of heating on a bimetallic strip',
        'Change in the level of liquid in a container on heating',
        'Effect of detergent on the surface tension of water (capillary rise)',
        'Factors affecting the rate of loss of heat of a liquid',
        'Effect of load on depression of a clamped metre scale, loaded at its end and at its middle',
        'Decrease in pressure with increase in velocity of a fluid'
      ]}
    ]},
    chemistry: { note:CHEM_NOTE, groups:[
      { k:'A', name:'A · Basic laboratory techniques', items:['Cutting a glass tube and a glass rod','Bending a glass tube','Drawing out a glass jet','Boring a cork'] },
      { k:'B', name:'B · Characterisation and purification', items:['Melting point of an organic compound','Boiling point of an organic compound','Crystallisation of an impure sample (alum, copper sulphate or benzoic acid)'] },
      { k:'C1', name:'C · pH experiments', need:1, items:['pH of fruit juices and of acid, base and salt solutions using pH paper / universal indicator','Compare the pH of strong and weak acids of the same concentration','pH change in the titration of a strong base using universal indicator'] },
      { k:'C2', name:'C · Common-ion effect', items:['pH change by common ion in weak acids and weak bases'] },
      { k:'D', name:'D · Chemical equilibrium', need:1, items:['Shift in equilibrium between ferric ions and thiocyanate ions','Shift in equilibrium between [Co(H₂O)₆]²⁺ and chloride ions'] },
      { k:'E', name:'E · Quantitative estimation', items:['Using a mechanical / electronic balance','Prepare a standard solution of oxalic acid','Strength of NaOH solution by titration against standard oxalic acid','Prepare a standard solution of sodium carbonate','Strength of HCl solution by titration against standard sodium carbonate'] },
      { k:'F', name:'F · Qualitative analysis', items:['Salt analysis: one cation and one anion in a given salt','Detection of nitrogen, sulphur and chlorine in organic compounds'] }
    ]},
    biology: { note:BIO_NOTE, groups:[
      { k:'A', name:'A · Experiments', items:[
        'Describe a flowering plant of family Solanaceae: floral whorls, anther and ovary, floral formula and diagram, root, stem and leaf',
        'T.S. of dicot and monocot roots and stems (primary)',
        'Osmosis by potato osmometer',
        'Plasmolysis in epidermal peels (Rhoeo / lily leaf or onion scale)',
        'Distribution of stomata on the upper and lower surfaces of leaves',
        'Rate of transpiration on the upper and lower surfaces of leaves',
        'Test for sugar, starch, proteins and fats in plant and animal materials',
        'Separation of plant pigments by paper chromatography',
        'Rate of respiration in flower buds / leaf tissue and germinating seeds',
        'Test for urea in urine',
        'Test for sugar in urine',
        'Test for albumin in urine',
        'Test for bile salts in urine'
      ]},
      { k:'B', name:'B · Spotting', items:[
        'Parts of a compound microscope',
        'Identify: bacteria, Oscillatoria, Spirogyra, Rhizopus, mushroom, yeast, liverwort, moss, fern, pine, a monocot, a dicot and a lichen',
        'Identify: Amoeba, Hydra, liver fluke, Ascaris, leech, earthworm, prawn, silkworm, honey bee, snail, starfish, shark, rohu, frog, lizard, pigeon, rabbit',
        'Mitosis in onion root tip cells and animal cells (grasshopper) from permanent slides',
        'Types of inflorescence: cymose and racemose',
        'Human skeleton and types of joints (virtual images / models)'
      ]}
    ]}
  },
  '12': {
    physics: { note:PHY_NOTE, groups:[
      { k:'AE', name:'Section A · Experiments', need:4, items:[
        'Resistivity of two / three wires from a potential difference against current graph',
        'Resistance of a given wire / standard resistor using a metre bridge',
        'Verify the laws of combination of resistances (series or parallel) using a metre bridge',
        'Resistance of a galvanometer by the half-deflection method and its figure of merit',
        'Convert a galvanometer into a voltmeter or an ammeter of desired range and verify',
        'Frequency of AC mains with a sonometer'
      ]},
      { k:'AA', name:'Section A · Activities', need:3, items:[
        'Resistance and impedance of an inductor with and without an iron core',
        'Multimeter: resistance, voltage (AC/DC), current (AC) and continuity of a circuit',
        'Assemble a household circuit: three bulbs, three switches, a fuse and a power source',
        'Assemble the components of a given electrical circuit',
        'Variation in potential drop with length of a wire for a steady current',
        'Draw a given open circuit, mark wrongly connected components and correct the circuit and diagram'
      ]},
      { k:'BE', name:'Section B · Experiments', need:4, items:[
        'Concave mirror: v for different values of u, and its focal length',
        'Focal length of a convex mirror using a convex lens',
        'Focal length of a convex lens from u-v or 1/u-1/v graphs',
        'Focal length of a concave lens using a convex lens',
        'Angle of minimum deviation of a prism from an i-δ graph',
        'Refractive index of a glass slab using a travelling microscope',
        'Refractive index of a liquid using a convex lens and a plane mirror',
        'Refractive index of a liquid using a concave mirror and a plane mirror',
        'I-V characteristic curve of a p-n junction diode in forward and reverse bias'
      ]},
      { k:'BA', name:'Section B · Activities', need:3, items:[
        'Identify a diode, an LED, a resistor and a capacitor from a mixed collection',
        'Multimeter: unidirectional current in a diode and an LED; check whether a component is in working order',
        'Effect of intensity of light on an LDR (varying distance of the source)',
        'Refraction and lateral deviation of a beam incident obliquely on a glass slab',
        'Diffraction of light due to a thin slit',
        'Nature and size of the image formed by a convex lens or concave mirror on a screen (candle at different distances)',
        'Lens combination of a specified focal length using two lenses from a given set'
      ]}
    ]},
    chemistry: { note:CHEM_NOTE + ' Groups H and I are split test by test here so each can be ticked separately.', groups:[
      { k:'A', name:'A · Surface chemistry', items:['Prepare one lyophilic and one lyophobic sol','Dialysis of the prepared sol','Role of emulsifying agents in stabilising emulsions of different oils'] },
      { k:'B1', name:'B · Chemical kinetics', items:['Effect of concentration and temperature on the rate of reaction between sodium thiosulphate and hydrochloric acid'] },
      { k:'B2', name:'B · Chemical kinetics, rate study', need:1, items:['Iodide ion with hydrogen peroxide at room temperature, varying iodide concentration','Potassium iodate with sodium sulphite using starch indicator (clock reaction)'] },
      { k:'C', name:'C · Thermochemistry', need:1, items:['Enthalpy of dissolution of copper sulphate or potassium nitrate','Enthalpy of neutralisation of strong acid (HCl) and strong base (NaOH)','Enthalpy change during hydrogen-bond formation between acetone and chloroform'] },
      { k:'D', name:'D · Electrochemistry', items:['Variation of cell potential in Zn/Zn²⁺ || Cu²⁺/Cu with electrolyte concentration'] },
      { k:'E', name:'E · Chromatography', items:['Separate pigments from leaf and flower extracts by paper chromatography; find Rf values','Separate two cations of an inorganic mixture by chromatography'] },
      { k:'F', name:'F · Preparation of inorganic compounds', items:['Double salt: ferrous ammonium sulphate or potash alum','Potassium ferric oxalate'] },
      { k:'G', name:'G · Preparation of organic compounds', need:1, items:['Acetanilide','Dibenzalacetone','p-Nitroacetanilide','Aniline yellow or 2-naphthol aniline dye'] },
      { k:'H', name:'H · Tests for functional groups', items:['Test for unsaturation','Test for the alcoholic group','Test for the phenolic group','Test for the aldehydic group','Test for the ketonic group','Test for the carboxylic group','Test for the primary amino group'] },
      { k:'I', name:'I · Carbohydrates, fats and proteins', items:['Characteristic tests of carbohydrates, pure samples and in foodstuffs','Characteristic tests of fats, pure samples and in foodstuffs','Characteristic tests of proteins, pure samples and in foodstuffs'] },
      { k:'J', name:'J · Volumetric analysis with KMnO₄', items:['Molarity of KMnO₄ by titration against standard oxalic acid','Molarity of KMnO₄ by titration against standard ferrous ammonium sulphate'] },
      { k:'K', name:'K · Qualitative analysis', items:['Salt analysis: one cation and one anion in a given salt'] }
    ]},
    biology: { note:BIO_NOTE, groups:[
      { k:'A', name:'A · Experiments', items:[
        'Temporary mount to observe pollen germination',
        'Plant population density by the quadrat method',
        'Plant population frequency by the quadrat method',
        'Temporary mount of onion root tip to study mitosis',
        'Isolate DNA from plant material (spinach, green pea seeds, papaya or banana)'
      ]},
      { k:'B', name:'B · Spotting', items:[
        'Flowers adapted to pollination by wind, insects and birds',
        'Pollen germination on stigma (permanent slide / scanning electron micrograph)',
        'Stages of gamete development: T.S. of testis and T.S. of ovary (permanent slides)',
        'Meiosis in onion bud cells or grasshopper testis (permanent slides)',
        'T.S. of blastula (mammalian) from permanent slides',
        'Mendelian inheritance using seeds of different colour / size',
        'Pedigree charts of a genetic trait (tongue rolling, blood groups, ear lobes, widow\'s peak, colour blindness)',
        'Controlled pollination: emasculation, tagging and bagging',
        'Disease-causing organisms: Ascaris, Entamoeba, Plasmodium, ringworm fungus, with symptoms',
        'Symbiosis in lichens and root nodules of legumes; parasitism of Cuscuta on its host',
        'Homologous and analogous organs (flash cards / models)'
      ]}
    ]}
  },

  /* ---------- UP Board (UPMSP) lists, session 2026-27. Class keys carry a "u" prefix. ---------- */
  'u9': { science: { note:'UP Board, 30 marks at school level: three experiments (Physics, Chemistry, Biology) 4 marks each, project work 9, sessional work 6, viva 3.', groups:[
    { k:'E', name:'Experiments', items:[
      'True solution, suspension and colloid: prepare and compare by transparency, filtration and stability',
      'Mixture and compound: prepare and distinguish by appearance, behaviour towards a magnet, carbon disulphide and heat',
      'Physical and chemical changes: iron with copper sulphate solution, burning magnesium ribbon, zinc with dilute sulphuric acid, heating copper sulphate crystals, sodium sulphate with barium chloride',
      'Temporary mounts of onion peel and human cheek cells',
      'Identify plant tissues (parenchyma, collenchyma, sclerenchyma) and animal tissues from prepared slides',
      'Melting point of ice and boiling point of water',
      'Verify the laws of reflection of sound',
      'Density of a solid denser than water using a balance and a measuring cylinder',
      'Loss in weight of a solid immersed in water against the weight of water displaced (two different solids)',
      'Speed of a pulse through a stretched string / slinky',
      'Verify the law of conservation of mass in a chemical reaction'
    ]}
  ]}},
  'u10': { science: { note:'UP Board practical, 30 marks. External examiner 15: three experiments (Physics, Chemistry, Biology) 4 marks each and viva 3. Internal 15: project work 9 and sessional work 6. The syllabus gives experiments 2 and 3 as alternatives.', groups:[
    { k:'E', name:'Experiments', need:14, items:[
      'pH of given samples with pH paper / universal indicator; reactions of HCl and NaOH with litmus, zinc and sodium carbonate',
      'Classify four reactions: combination, decomposition, displacement, double displacement',
      'Action of Zn, Fe, Cu and Al on salt solutions; arrange the metals by reactivity',
      'Ohm\'s law: current against potential difference across a resistor, its resistance and the graph',
      'Equivalent resistance of resistors in series and in parallel',
      'Temporary mount of a leaf peel to show stomata',
      'Show that carbon dioxide is given out during respiration',
      'Properties of ethanoic acid: odour, solubility, effect on litmus, reaction with sodium hydrogen carbonate',
      'Cleaning capacity of soap in soft and hard water',
      'Focal length of a concave mirror and a convex lens using a distant object',
      'Path of a light ray through a glass slab; angles of incidence, refraction and emergence',
      'Binary fission in Amoeba and budding in yeast (prepared slides)',
      'Path of light rays through a glass prism',
      'Parts of a dicot seed (pea, gram, rajma or bean)',
      'Draw the magnetic field lines of a given magnet'
    ]}
  ]}},
  'u11': {
    physics: { note:UP_PHY_NOTE, groups:[
      { k:'A', name:'Section A (खंड-क)', items:[
        'Vernier calipers: diameter of a small spherical / cylindrical body',
        'Screw gauge: diameter of a given wire',
        'Weight of a given body using the parallelogram law of vectors',
        'Simple pendulum: L-T and L-T² graphs; effective length of a seconds pendulum',
        'Spherometer: radius of curvature of a spherical surface',
        'Acceleration due to gravity (g) using a simple pendulum',
        'Limiting friction against normal reaction; coefficient of friction between a block and a horizontal surface',
        'Young\'s modulus of the material of a wire using Searle\'s apparatus',
        'Force constant of a helical spring from a load-extension graph',
        'Surface tension of water by capillary rise'
      ]},
      { k:'B', name:'Section B (खंड-ख)', start:11, items:[
        'Cooling curve: temperature of a hot body against time',
        'Specific heat capacity of a solid and of a liquid by the method of mixtures',
        'Sonometer: frequency against length at constant tension, and length against tension at constant frequency',
        'Speed of sound in air at room temperature and end correction using a resonance tube',
        'Volume against pressure of air at constant temperature: P-V and P-1/V graphs',
        'Coefficient of viscosity of a liquid from the terminal velocity of a spherical body',
        'Verify Newton\'s law of cooling',
        'Force constant of a spring from a load against increase-in-length curve',
        'Frequency of a tuning fork using a sonometer',
        'Compare the frequencies of two tuning forks using a resonance tube'
      ]}
    ]},
    chemistry: { note:'UP Board practical, 30 marks: content-based experiments 4, volumetric analysis 8, qualitative analysis 8 (salt 6, organic elements 2), class record and project 5, viva 5.', groups:[
      { k:'A', name:'1 · Basic laboratory techniques', items:['Cutting a glass tube or glass rod','Bending a glass tube','Drawing out a glass jet','Boring a cork'] },
      { k:'B', name:'2 · Purification and characterisation', items:['Melting point of an organic compound','Boiling point of an organic compound','Crystallisation of an impure sample (alum, copper sulphate or benzoic acid)'] },
      { k:'C', name:'3 · pH experiments', need:1, items:['pH of fruit juices and of acid, base and salt solutions; compare strong and weak acids; pH change in an acid-base titration','pH change in weak acids and weak bases by the common-ion effect'] },
      { k:'D', name:'4 · Chemical equilibrium', need:1, items:['Shift in equilibrium between ferric ions and thiocyanate ions','Shift in equilibrium between the cobalt aqua complex and chloride ions'] },
      { k:'E', name:'5 · Volumetric analysis', items:['Prepare a standard solution of oxalic acid','Strength of a given sodium hydroxide solution by titration','Prepare a standard solution of sodium carbonate','Strength of a given hydrochloric acid solution against standard sodium carbonate'] },
      { k:'F', name:'6 · Qualitative analysis', items:['Salt analysis: one cation and one anion in a given salt','Detection of nitrogen, sulphur and chlorine in organic compounds'] }
    ]},
    biology: { note:'UP Board practical: 30 marks. The syllabus lists 14 experiments and 6 spotting items and gives no further split of the marks.', groups:[
      { k:'A', name:'A · Experiments', items:[
        'Types of root (tap, adventitious), stem (herbaceous, woody) and leaf (arrangement, shape, venation, simple or compound)',
        'T.S. of dicot and monocot roots and stems',
        'Describe a flowering plant of family Solanaceae: floral whorls, ovary and anther, floral formula and diagram',
        'Separation of plant pigments by paper chromatography',
        'Rate of respiration in flower buds, leaf tissue and germinating seeds',
        'Test for sugar in urine',
        'Test for albumin in urine',
        'Plasmolysis in epidermal peels (Rhoeo leaf)',
        'Rate of transpiration on the upper and lower surfaces of leaves',
        'Test for sugar, starch, proteins and fats',
        'Osmosis by potato osmometer',
        'Distribution of stomata on the upper and lower surfaces of leaves',
        'Test for bile salts in urine',
        'Test for urea in urine'
      ]},
      { k:'B', name:'B · Spotting', items:[
        'Parts of a compound microscope',
        'Identify: bacteria, Oscillatoria, Spirogyra, Rhizopus, mushroom, yeast, liverwort, moss, fern, pine, a monocot, a dicot and a lichen',
        'Types of inflorescence: cymose and racemose',
        'Identify: Amoeba, Hydra, liver fluke, Ascaris, leech, earthworm, prawn, silkworm, honey bee, snail, starfish, shark, rohu, frog, lizard, pigeon, rabbit',
        'Mitosis in onion root tip cells and grasshopper cells (permanent slides)',
        'Human skeleton and types of joints'
      ]}
    ]}
  },
  'u12': {
    physics: { note:UP_PHY_NOTE, groups:[
      { k:'A', name:'Section A (खंड-क)', items:[
        'Refractive index of a glass slab using a travelling microscope',
        'Refractive index of a liquid using a plane mirror and a convex lens',
        'Concave mirror: v for different values of u, and its focal length',
        'Verify Ohm\'s law with an ammeter and voltmeter; specific resistance of the wire\'s material',
        'Focal length of a convex mirror using a convex lens',
        'Focal length of a convex lens from u-v or 1/u-1/v graphs',
        'Focal length of a concave lens using a convex lens',
        'Angle of minimum deviation of a prism from an i-δ graph; refractive index of its material',
        'Resistance and specific resistance of a wire using a metre bridge',
        'Verify the laws of series and parallel combination of resistances using a metre bridge',
        'Internal resistance of a cell using a voltmeter and resistance box'
      ]},
      { k:'B', name:'Section B (खंड-ख)', start:12, items:[
        'Compare the emfs of two primary cells using a potentiometer',
        'Internal resistance of a primary cell using a potentiometer',
        'Focal length of a convex lens by the displacement method',
        'Resistance of a galvanometer by the half-deflection method and its figure of merit',
        'Convert a galvanometer into an ammeter of desired range',
        'Convert a galvanometer into a voltmeter of desired range',
        'Characteristic curve of a p-n junction diode and its forward-bias resistance',
        'Characteristic curve of a Zener diode',
        'Reverse breakdown voltage from the characteristic curve of a Zener diode'
      ]}
    ]},
    chemistry: { note:'UP Board practical, 30 marks. External 15: qualitative analysis 4, volumetric analysis 4, content-based experiment 3, viva 4. Internal 15: project and viva 8, class record 4, content-based experiment 3. Functional-group and food tests are split test by test here so each can be ticked separately.', groups:[
      { k:'Q', name:'Qualitative analysis', items:['Salt analysis: one cation and one anion in a given salt'] },
      { k:'V', name:'Volumetric analysis with KMnO₄', items:['Strength / molarity by titration against standard oxalic acid','Strength / molarity by titration against standard Mohr\'s salt (ferrous ammonium sulphate)'] },
      { k:'CH', name:'Content-based · Chromatography', items:['Separate pigments from leaf and flower extracts by paper chromatography; find Rf values','Separate a mixture of two inorganic salts by chromatography'] },
      { k:'FG', name:'Content-based · Functional groups', items:['Test for unsaturation','Test for the alcoholic group','Test for the phenolic group','Test for the aldehydic group','Test for the ketonic group','Test for the carboxylic group','Test for the primary amino group'] },
      { k:'FD', name:'Content-based · Food tests', items:['Test for carbohydrates in a given food sample','Test for fats in a given food sample','Test for proteins in a given food sample'] },
      { k:'SO', name:'Content-based · Sols and emulsions', items:['Prepare one lyophilic and one lyophobic sol','Purify the prepared sol by dialysis','Effect of emulsifying agents on the stability of emulsions of different oils'] },
      { k:'EC', name:'Content-based · Electrochemistry', items:['Variation of cell potential in Zn/Zn²⁺ || Cu²⁺/Cu with electrolyte concentration'] },
      { k:'IP', name:'Preparation of inorganic compounds', items:['Double salt: Mohr\'s salt or potash alum','Potassium ferric oxalate'] },
      { k:'OP', name:'Preparation of organic compounds', need:1, items:['Acetanilide','Dibenzalacetone','p-Nitroacetanilide','Aniline yellow or 2-naphthol aniline dye'] },
      { k:'K1', name:'Chemical kinetics', items:['Effect of concentration and temperature on the rate of reaction between sodium thiosulphate and hydrochloric acid'] },
      { k:'K2', name:'Chemical kinetics, rate study', need:1, items:['Iodide ion with hydrogen peroxide at room temperature, varying iodide concentration','Potassium iodate with sodium sulphite using starch indicator'] },
      { k:'TH', name:'Thermochemistry', need:1, items:['Enthalpy of solution of copper sulphate or potassium nitrate','Enthalpy of neutralisation of a strong acid and a strong base','Enthalpy change during hydrogen-bond formation between acetone and chloroform'] }
    ]},
    biology: { note:'UP Board practical, 30 marks. External 15: slide preparation 5, spotting 6, practical file and viva 4. Internal 15: long experiment 5, short experiment 4, project and viva 6.', groups:[
      { k:'A', name:'A · Experiments', items:[
        'Plant population density by the quadrat method',
        'Plant population frequency by the quadrat method',
        'Pollen germination on a temporary slide',
        'Temporary slide of onion root tip to study mitosis',
        'Isolate DNA from plant material (spinach, green peas, papaya)'
      ]},
      { k:'B', name:'B · Spotting', items:[
        'Pollen germination on stigma (permanent slide)',
        'Controlled pollination: emasculation, tagging and bagging',
        'Flowers adapted to pollination by different agencies such as wind and insects',
        'Stages of gamete development: T.S. of testis and T.S. of ovary (permanent slides)',
        'Meiosis in onion bud cells or grasshopper testis (permanent slides)',
        'T.S. of blastula (mammalian) from permanent slides',
        'Mendelian inheritance using seeds of different colour / shape',
        'Pedigree charts of genetic traits (tongue rolling, blood groups, widow\'s peak, colour blindness)',
        'Disease-causing organisms: Ascaris, Entamoeba, Plasmodium, ringworm fungus, with symptoms',
        'Symbiosis in root nodules of leguminous plants (model / specimen)',
        'Homologous and analogous organs (flash cards / models)'
      ]}
    ]}
  }
};
