import { validateCatalog, type Activity, type CatalogRecord } from './contracts.ts';

type Starter = {
	id: string;
	title: string;
	subject: Activity['subject'];
	concepts: string[];
	question: string;
	materials: string;
	steps: string[];
	explanation: string;
	observe: string;
	minutes?: number;
	wait?: number;
	setting?: Activity['setting'];
	kind?: Activity['kind'];
	adult?: Activity['adult'];
	age?: number;
	safety?: string;
	fairTest?: string;
	sources?: Activity['sources'];
};

const entries: Starter[] = [
	{
		id: 'ice-insulation',
		title: 'Keep an ice cube frozen',
		subject: 'physics',
		concepts: ['heat-transfer', 'states-of-matter', 'materials'],
		question: 'Which wrapping slows an ice cube’s melting?',
		materials: 'ice cubes|3 equal;small bowls|3;cloth|1 piece;paper|1 sheet;timer|1;tray|1',
		steps: [
			'Place equal ice cubes in three identical bowls on a tray.',
			'Leave one bare, wrap one in cloth and one in paper. Put all three in the same room away from sunlight.',
			'Check every five minutes without handling the ice. After twenty minutes, compare how much solid ice remains.'
		],
		explanation:
			'Heat moves from the warmer surroundings into the ice. Some wrappings slow that transfer; they do not make cold. Melting changes solid water into liquid water.',
		observe:
			'Draw or photograph the remaining ice at each check. Which cube retained the most ice?',
		minutes: 15,
		wait: 20,
		safety: 'Keep meltwater on a tray and wipe spills promptly.'
	},
	{
		id: 'ramp-surfaces',
		title: 'The slowest slide',
		subject: 'physics',
		concepts: ['friction', 'forces', 'measurement'],
		question: 'How does a ramp’s surface change how a block slides?',
		materials: 'cardboard|1 sturdy sheet;books|2;cloth|1 piece;wooden block|1 large;timer|1',
		steps: [
			'Prop cardboard on two books on the floor to make a low ramp.',
			'Release a large block from a marked line without pushing and time its slide.',
			'Cover the ramp with cloth, keep the height the same, and repeat both surfaces three times.'
		],
		explanation:
			'Friction is a contact force that opposes sliding. Different surfaces produce different amounts of friction; a block may even stay still if the ramp is shallow.',
		observe: 'Compare slide times, including any trials when the block does not move.'
	},
	{
		id: 'shadow-distance',
		title: 'Make a shadow grow',
		subject: 'physics',
		concepts: ['light', 'measurement', 'scale'],
		question: 'What happens to a shadow when its object moves closer to a flashlight?',
		materials: 'flashlight|1;cardboard|1 small piece;paper|2 sheets;ruler|1',
		steps: [
			'Stand a sheet of paper against a wall and shine a flashlight toward it.',
			'Hold the cardboard between the light and paper. Mark its shadow size.',
			'Keep the flashlight and screen still. Move the cardboard closer to the light and compare the new shadow.'
		],
		explanation:
			'Light travels outward from the flashlight. An object closer to the light blocks a larger spread of rays before they reach the screen, making a larger shadow.',
		observe: 'Measure shadow height at three object positions.',
		safety: 'Aim the flashlight at the screen, never into anyone’s eyes.'
	},
	{
		id: 'ruler-music',
		title: 'A ruler that sings',
		subject: 'physics',
		concepts: ['sound', 'measurement'],
		question: 'Does the length of a ruler’s overhang change its sound?',
		materials: 'flexible plastic ruler|1;table|1 stable;paper|1 sheet',
		steps: [
			'An adult holds a flexible ruler firmly on a table with half extending over the edge.',
			'Gently bend and release the free end. Listen and watch it vibrate.',
			'Repeat with a shorter overhang, using the same gentle movement. Compare pitch.'
		],
		explanation:
			'A vibrating object makes nearby air vibrate, producing sound. A shorter free section of the same ruler usually vibrates faster and produces a higher pitch.',
		observe: 'Describe which overhang makes the higher sound, and which vibrations you can see.',
		adult: 'help',
		safety:
			'Use an uncracked plastic ruler and bend only a little. Keep faces clear of the free end.'
	},
	{
		id: 'foil-boats',
		title: 'Can foil carry a cargo?',
		subject: 'physics',
		concepts: ['buoyancy', 'density', 'design'],
		question: 'Can changing the shape of foil help it carry more weight on water?',
		materials: 'aluminum foil|2 equal squares;water|1 shallow bowl;large building blocks|6;tray|1',
		steps: [
			'Place a shallow bowl of water on a tray.',
			'Fold one foil square into a wide boat and the other into a narrower boat with the same height of sides.',
			'Float each boat and add the same large blocks one at a time in the center. Count the load before water enters.'
		],
		explanation:
			'Water pushes upward on a boat. A hollow shape can displace enough water to support both the foil and its load. Boat shape and how the load is placed both matter.',
		observe: 'Record the number of blocks each boat supports. Try again with new foil.',
		safety: 'Use blocks too large to swallow and dry spills immediately.'
	},
	{
		id: 'paper-parachutes',
		title: 'A slower trip to the floor',
		subject: 'physics',
		concepts: ['air', 'gravity', 'design'],
		question: 'Does a larger paper canopy slow a falling paper passenger?',
		materials: 'paper|2 sheets;string|8 short pieces;tape|1 roll;paper towel|1 sheet',
		steps: [
			'Make one small and one larger square canopy from paper. Tape four equal short strings to each.',
			'Attach identical crumpled paper-towel passengers to the strings.',
			'From an adult’s shoulder height, release each without throwing. Repeat and compare how long they take to land.'
		],
		explanation:
			'Gravity pulls the parachute down while air resistance opposes its motion. A larger open canopy often increases air resistance, but tangled strings or a folded canopy can change the result.',
		observe: 'Compare the falls and note whether each canopy opens fully.',
		adult: 'help',
		safety: 'Drop from floor level without climbing. Keep strings short and away from necks.'
	},
	{
		id: 'mirror-message',
		title: 'Read a reflection',
		subject: 'physics',
		concepts: ['reflection', 'light', 'senses'],
		question: 'How does writing look when viewed in a mirror?',
		materials: 'unbreakable mirror|1;paper|2 sheets;crayons|2',
		steps: [
			'Write a short word and draw an arrow on paper.',
			'Stand a small unbreakable mirror beside the paper and inspect the reflection.',
			'Try writing a message that becomes easier to read in the mirror. Compare the original with its reflection.'
		],
		explanation:
			'A flat mirror reflects light and reverses the direction perpendicular to its surface. A drawing and its reflection have opposite handedness, which makes familiar writing look reversed.',
		observe: 'Which letters appear unchanged? Which look different?',
		kind: 'observation',
		safety: 'Use a child-safe unbreakable mirror, not a loose glass mirror.'
	},
	{
		id: 'balancing-bird',
		title: 'Find the balance point',
		subject: 'physics',
		concepts: ['balance', 'gravity', 'design'],
		question: 'How does moving a weight change where a cardboard shape balances?',
		materials: 'cardboard|1 strip;modeling clay|2 small pieces;wooden block|1 large',
		steps: [
			'Rest a cardboard strip across the narrow upper edge of a large block.',
			'Move the strip until it balances, then mark the support position.',
			'Press clay near one end. Find the new balance point and repeat with the clay moved closer to the middle.'
		],
		explanation:
			'An object balances when its weight is distributed so the turning effects around the support cancel. Adding clay shifts its center of mass toward the clay.',
		observe: 'Mark how the balance point changes as the clay moves.',
		safety: 'Keep modeling clay away from mouths and wash hands afterward.'
	},
	{
		id: 'dissolving-race',
		title: 'Stirring a disappearing spoonful',
		subject: 'chemistry',
		concepts: ['dissolving', 'mixtures', 'measurement'],
		question: 'Does stirring change how quickly sugar dissolves?',
		materials: 'water|2 equal cups;sugar|2 teaspoons;clear cups|2;spoon|1;timer|1',
		steps: [
			'Put equal amounts of room-temperature water in two clear cups.',
			'Add one teaspoon of sugar to each at the same time.',
			'Stir one gently and leave the other still. Compare visible grains after each minute.'
		],
		explanation:
			'Dissolved sugar particles spread through water even though they are too small to see. Stirring brings fresh water into contact with the sugar, usually speeding up dissolving.',
		observe: 'Record when no grains remain visible. Dissolving is different from melting.',
		safety: 'Do not taste experiment mixtures. Clean sticky spills.'
	},
	{
		id: 'oil-water-layers',
		title: 'Two liquids, two layers',
		subject: 'chemistry',
		concepts: ['density', 'mixtures'],
		question: 'What happens when oil and water are stirred together and left to rest?',
		materials: 'water|half a cup;cooking oil|2 tablespoons;clear cup|1;spoon|1',
		steps: [
			'Pour water into a clear cup and gently add oil.',
			'Sketch the layers, then stir for ten seconds.',
			'Let the cup stand for five minutes and sketch how the liquids separate.'
		],
		explanation:
			'Oil and water do not readily mix. Common cooking oils are less dense than water, so the oil layer settles on top after the droplets come together.',
		observe: 'Watch how the small oil droplets change after stirring stops.',
		wait: 5,
		safety: 'Do not drink the mixture. Wipe oil off surfaces to prevent slips.'
	},
	{
		id: 'walking-water',
		title: 'Water climbs a paper bridge',
		subject: 'chemistry',
		concepts: ['capillary-action', 'materials', 'measurement'],
		question: 'Can a paper towel carry water between cups?',
		materials: 'clear cups|2;water|half a cup;paper towel|1 sheet;food coloring|1 drop;tray|1',
		steps: [
			'Put two cups side by side on a tray. Half-fill one with water and one drop of food coloring.',
			'Fold a paper towel into a strip. Put one end in the water and the other into the empty cup.',
			'Observe every ten minutes for an hour, recording how far the wet region moves.'
		],
		explanation:
			'Water is attracted to the towel’s fibers and moves through its tiny spaces by capillary action. Once the towel is wet, water can travel along the bridge into the other cup.',
		observe: 'Mark the wet edge on a separate sketch. Does water reach the empty cup?',
		wait: 60,
		safety: 'Food coloring can stain; protect the table and do not drink the water.'
	},
	{
		id: 'pepper-surface',
		title: 'Pepper on the move',
		subject: 'chemistry',
		concepts: ['surface-tension', 'mixtures'],
		question: 'How does a tiny touch of soap change the surface of water?',
		materials: 'water|1 shallow dish;ground pepper|1 small pinch;dish soap|1 drop;spoon|1',
		steps: [
			'An adult gently sprinkles a small pinch of pepper on still water without making dust.',
			'Touch a clean spoon tip to the surface and note what happens.',
			'Put a tiny drop of dish soap on the spoon tip and touch the center of the water. Watch the pepper.'
		],
		explanation:
			'Soap lowers surface tension where it touches the water. The surface flows toward regions with greater surface tension, carrying pepper along. The pepper is showing the water’s motion.',
		observe: 'Compare the clean spoon trial with the soapy spoon trial. Use fresh water to repeat.',
		adult: 'help',
		safety: 'An adult handles pepper away from faces. Avoid inhaling it and keep soap out of eyes.'
	},
	{
		id: 'salt-reappears',
		title: 'The salt comes back',
		subject: 'chemistry',
		concepts: ['evaporation', 'dissolving', 'states-of-matter'],
		question: 'What remains when salty water dries?',
		materials: 'water|4 tablespoons;salt|1 teaspoon;shallow dishes|2;spoon|1',
		steps: [
			'Mix salt with two tablespoons of room-temperature water until dissolved.',
			'Pour the salt water into one labeled dish and two tablespoons of plain water into the other.',
			'Leave both in the same protected indoor spot. Check daily until dry.'
		],
		explanation:
			'Liquid water evaporates into water vapor. Dissolved salt does not evaporate with it under these conditions, so it is left behind as solid crystals.',
		observe: 'Compare what remains in the two dishes after all visible water is gone.',
		minutes: 10,
		wait: 4320,
		safety: 'Do not taste the residue. Keep dishes away from pets and food preparation.'
	},
	{
		id: 'fizz-in-open-cup',
		title: 'Catch a fizz in action',
		subject: 'chemistry',
		concepts: ['reaction', 'mixtures', 'measurement'],
		question: 'What changes when baking soda meets vinegar?',
		materials:
			'baking soda|1 teaspoon;vinegar|2 tablespoons;open plastic cup|1 large;tray|1;spoon|1',
		steps: [
			'Put a large open plastic cup on a tray and add one teaspoon of baking soda.',
			'Predict what will happen, then slowly add two tablespoons of vinegar.',
			'Watch and describe the bubbles until they stop. Compare the materials before and after mixing.'
		],
		explanation:
			'Vinegar reacts with baking soda to form new substances, including carbon dioxide gas. Escaping gas makes bubbles. Gas formation here is a chemical reaction, unlike water boiling.',
		observe:
			'Record changes you can actually observe, such as bubbling, rather than assuming the gas is steam.',
		adult: 'help',
		safety: 'Keep the cup open at all times. Do not seal, taste, or bring the mixture near eyes.',
		kind: 'observation'
	},
	{
		id: 'marker-colors',
		title: 'The hidden colors in a marker',
		subject: 'chemistry',
		concepts: ['mixtures', 'capillary-action'],
		question: 'Is one washable marker color made from several dyes?',
		materials: 'coffee filter|1;washable markers|2;water|2 tablespoons;clear cup|1;pencil|1',
		steps: [
			'Draw a small marker dot near the bottom of a coffee-filter strip and a pencil line below it.',
			'Put only the bottom edge in shallow water, keeping the marker dot above the waterline.',
			'Watch water climb the strip. Try another marker on a separate strip under the same conditions.'
		],
		explanation:
			'Water carries some dyes through paper. Different dyes may travel different distances because they interact differently with water and paper. Some markers separate into several colors; others do not.',
		observe: 'Sketch the bands and their distances from the starting dots.',
		wait: 15,
		safety: 'Use washable water-based markers, never permanent markers or solvents.'
	},
	{
		id: 'ice-and-salt',
		title: 'A salty ice comparison',
		subject: 'chemistry',
		concepts: ['states-of-matter', 'mixtures', 'heat-transfer'],
		question: 'What changes when salt is added to melting ice?',
		materials: 'ice cubes|2 equal;salt|half a teaspoon;small bowls|2;timer|1',
		steps: [
			'Put matching ice cubes in two identical bowls.',
			'Sprinkle salt on one cube and leave the other plain.',
			'Compare every two minutes for ten minutes without touching the ice. Look at meltwater and surface texture.'
		],
		explanation:
			'Salt dissolves in the thin liquid layer on ice and lowers the mixture’s freezing point. This can allow more ice to melt; the outcome also depends on surrounding temperature and salt amount.',
		observe: 'Note puddle size and surface changes in both bowls.',
		safety: 'Do not hold salty ice against skin. Observe in bowls and wash hands after cleanup.'
	},
	{
		id: 'bean-window',
		title: 'A window into a seed',
		subject: 'biology',
		concepts: ['plants', 'water-cycle', 'measurement'],
		question: 'What appears first when a bean seed begins to grow?',
		materials: 'dried bean seeds|3;paper towel|1 sheet;clear container|1;water|2 tablespoons',
		steps: [
			'Moisten a paper towel so it is damp rather than dripping.',
			'Place beans against the side of a clear container with the towel behind them. Leave the top open.',
			'Keep in a mild indoor spot, maintain dampness, and draw changes each day for a week.'
		],
		explanation:
			'A viable seed absorbs water and begins germination when conditions suit it. A root usually emerges before the shoot. Early growth uses stored food in the seed.',
		observe: 'Draw root and shoot growth separately. Some seeds may not germinate.',
		minutes: 10,
		wait: 10080,
		kind: 'observation',
		safety:
			'Seeds are not for eating. An adult discards the whole setup if mold appears; wash hands after handling.'
	},
	{
		id: 'leaf-rubbings',
		title: 'Map a leaf’s veins',
		subject: 'biology',
		concepts: ['plants', 'adaptation', 'biodiversity'],
		question: 'How do vein patterns differ among fallen leaves?',
		materials: 'fallen leaves|3 familiar types;paper|3 sheets;crayons|2',
		steps: [
			'Collect fallen leaves from familiar non-irritating plants with an adult.',
			'Place one leaf beneath paper and gently rub the side of a crayon over it.',
			'Compare three rubbings and group them by vein pattern and leaf shape.'
		],
		explanation:
			'Leaf veins transport water and other substances and help support the leaf. Their branching patterns vary among plants, so they can help us describe and compare leaves.',
		observe: 'Look for a central vein, branching veins, and parallel patterns.',
		kind: 'observation',
		setting: 'either',
		safety: 'Avoid unknown or irritating plants. Wash hands and leave attached leaves on plants.'
	},
	{
		id: 'celery-water',
		title: 'Follow water through a stem',
		subject: 'biology',
		concepts: ['plants', 'capillary-action', 'adaptation'],
		question: 'Where does colored water travel in a celery stem?',
		materials:
			'celery with leaves|1 stalk;water|half a cup;food coloring|2 drops;clear cup|1;knife|1 for adult use only;cutting board|1',
		steps: [
			'An adult trims the bottom of a celery stalk and places it in lightly colored water.',
			'Leave the stalk upright and compare the leaves over the next day.',
			'An adult cuts across the stalk after observation so you can inspect the colored pathways.'
		],
		explanation:
			'Water travels through narrow plant tubes called xylem. Evaporation from leaves helps pull water upward, while attraction between water and tube walls also contributes.',
		observe: 'Look for color in leaf veins and in small areas of the cut stem.',
		adult: 'help',
		wait: 1440,
		safety: 'Only an adult uses the knife. Do not eat experimental celery; food coloring can stain.'
	},
	{
		id: 'garden-square',
		title: 'Life in one little square',
		subject: 'biology',
		concepts: ['habitats', 'biodiversity', 'measurement'],
		question: 'What living things can we observe in a small patch of ground?',
		materials: 'string|1 short loop;paper|1 sheet;crayons|2;magnifying glass|1 optional',
		steps: [
			'With an adult, lay a string square on a safe patch of garden ground.',
			'Observe for ten minutes without moving animals or picking plants.',
			'Draw the plants and animals you can distinguish. Compare a second equally sized patch.'
		],
		explanation:
			'A habitat supplies conditions and resources living things need. Different small patches can support different organisms, and one short observation will not reveal every resident.',
		observe: 'Count visibly different kinds and note shade, moisture, and ground cover.',
		kind: 'observation',
		setting: 'outdoor',
		safety:
			'Do not touch insects, fungi, animal waste, or unknown plants. Never focus sunlight through a magnifier.'
	},
	{
		id: 'camouflage-search',
		title: 'Hide in plain sight',
		subject: 'biology',
		concepts: ['adaptation', 'senses', 'habitats'],
		question: 'Does a paper shape’s color affect how easily we find it?',
		materials: 'colored paper|3 sheets;child scissors|1 pair;timer|1',
		steps: [
			'An adult helps cut equal-sized shapes in two colors.',
			'Scatter equal numbers on a background matching one color while the searcher looks away.',
			'Give the searcher ten seconds to point to shapes. Swap searchers and compare colors found.'
		],
		explanation:
			'Camouflage can make an organism less noticeable against its surroundings. This paper model tests visibility, but real animals also use shape, pattern, behavior, and movement.',
		observe: 'Count finds by color across several trials.',
		adult: 'help',
		safety: 'Supervise scissors and keep paper pieces out of mouths.'
	},
	{
		id: 'pinecone-weather',
		title: 'A pinecone changes shape',
		subject: 'biology',
		concepts: ['adaptation', 'plants', 'weather'],
		question: 'Does a fallen pinecone look different when damp and dry?',
		materials: 'fallen pinecones|2 similar;water|1 shallow bowl;tray|1;paper|1 sheet',
		steps: [
			'Sketch two dry fallen pinecones and the spaces between their scales.',
			'Put one in shallow water and leave the other dry. Observe for an hour.',
			'Place both on a tray to dry naturally and check the following day.'
		],
		explanation:
			'Pinecone scales change shape as their tissues absorb and lose water. In many pine species, scales close when wet and open when dry, helping govern when seeds are released.',
		observe: 'Compare the gaps between scales in wet and dry conditions.',
		wait: 1440,
		safety: 'Use clean fallen cones with no mold or sharp broken parts. Wash hands after handling.'
	},
	{
		id: 'sound-location',
		title: 'Where did that sound come from?',
		subject: 'biology',
		concepts: ['senses', 'sound'],
		question: 'How well can we locate a quiet sound without looking?',
		materials: 'paper|1 sheet;chair|1;crayons|1',
		steps: [
			'Sit in a clear space and close your eyes if comfortable; do not use a blindfold.',
			'An adult rustles paper gently from the left, right, front, or behind at the same distance.',
			'Point toward the sound, then open your eyes to check. Repeat and record guesses.'
		],
		explanation:
			'The brain combines information from both ears, including small differences in timing and loudness, to estimate a sound’s direction. Some directions are easier to confuse than others.',
		observe: 'Compare guesses across directions without treating errors as failure.',
		kind: 'observation',
		safety:
			'Stay seated and use quiet sounds away from the ears. Stop if closing eyes feels uncomfortable.'
	},
	{
		id: 'seed-travel',
		title: 'Seeds on the breeze',
		subject: 'biology',
		concepts: ['adaptation', 'air', 'plants'],
		question: 'How can a wing help a seed-shaped model travel?',
		materials: 'paper|2 sheets;tape|1 roll;child scissors|1 pair',
		steps: [
			'An adult helps make a folded paper wing with a small crumpled paper seed attached.',
			'Make a matching paper seed with no wing, using the same total amount of paper.',
			'Drop both from shoulder height in still air and compare their paths over three trials.'
		],
		explanation:
			'Some plants have winged seeds that interact with moving air. This model explores how shape affects a fall; it does not reproduce all the features of a real seed.',
		observe: 'Compare time in the air and sideways travel.',
		adult: 'help',
		safety: 'Drop without climbing, and supervise scissors.'
	},
	{
		id: 'puddle-watch',
		title: 'Where did the puddle go?',
		subject: 'earth',
		concepts: ['evaporation', 'water-cycle', 'sunlight'],
		question: 'Do matching shallow puddles dry at the same rate in sun and shade?',
		materials: 'water|half a cup;shallow dishes|2 identical;measuring cup|1;paper|1 sheet',
		steps: [
			'Put equal small amounts of water in matching dishes.',
			'Place one in sun and one in shade where they will not be disturbed.',
			'Check every fifteen minutes and record how much water remains. Note wind and weather too.'
		],
		explanation:
			'Liquid water evaporates into invisible water vapor. Sunlight can warm water and increase evaporation, but airflow and humidity also affect drying.',
		observe: 'Compare drying times and record other differences between the two locations.',
		setting: 'outdoor',
		wait: 90,
		safety: 'Use safe ground-level locations with an adult and avoid hot surfaces.',
		fairTest:
			'Use identical dishes and equal water. Sun and shade may differ in wind too, so describe this as a comparison rather than proof that sunlight is the only cause.'
	},
	{
		id: 'rain-gauge',
		title: 'Measure a rainy day',
		subject: 'earth',
		concepts: ['weather', 'water-cycle', 'measurement'],
		question: 'How much rain falls into a straight-sided container?',
		materials: 'straight-sided plastic container|1;ruler|1;paper|1 sheet;crayons|1',
		steps: [
			'Place an empty straight-sided container upright in a stable open spot away from roofs.',
			'After rain, measure the water depth in millimeters at eye level.',
			'Empty it after each reading and record the time interval before collecting again.'
		],
		explanation:
			'Rainfall depth describes how much water would cover a level surface without runoff or soaking in. A container needs a uniform cross-section to estimate that depth directly.',
		observe: 'Keep a rainfall record for several days, including days with zero rain.',
		kind: 'observation',
		setting: 'outdoor',
		wait: 1440,
		safety:
			'Read the gauge only in safe weather, never during thunder or lightning. Empty standing water daily.'
	},
	{
		id: 'soil-settling',
		title: 'Soil sorts itself',
		subject: 'earth',
		concepts: ['soil', 'mixtures', 'density'],
		question: 'What happens when soil stirred in water is left to settle?',
		materials: 'clean potting soil|2 tablespoons;water|1 cup;clear plastic container|1;spoon|1',
		steps: [
			'An adult puts a little fresh bagged potting soil into a clear container.',
			'Add water and stir gently. Sketch its cloudy appearance.',
			'Leave undisturbed and observe after ten minutes, one hour, and one day.'
		],
		explanation:
			'Soil contains different-sized particles and organic matter. Larger mineral particles often settle faster, while tiny particles remain suspended longer and some organic matter floats.',
		observe: 'Look for settling layers, floating pieces, and changes in cloudiness.',
		wait: 1440,
		safety:
			'An adult handles dry soil to avoid dust. Do not use soil with animal waste; wash hands and never drink the water.'
	},
	{
		id: 'rain-on-a-hill',
		title: 'When rain meets a hillside',
		subject: 'earth',
		concepts: ['erosion', 'soil', 'design'],
		question: 'Can a surface covering reduce how much soil running water carries away?',
		materials:
			'trays|2;clean potting soil|2 equal cups;fallen leaves|1 handful;water|1 cup;measuring cup|1',
		steps: [
			'An adult makes equal small soil slopes in two trays.',
			'Cover one slope with fallen leaves and leave the other bare.',
			'Pour equal amounts of water slowly at the top of each slope. Compare the soil carried downhill.'
		],
		explanation:
			'Moving water can detach and transport soil, a process called erosion. Surface cover can interrupt water flow and shield soil, although roots and real rainfall add other effects outdoors.',
		observe: 'Compare channels, muddy runoff, and where displaced soil collects.',
		setting: 'outdoor',
		adult: 'help',
		safety: 'Avoid soil dust, keep runoff out of drains, and wash hands afterward.'
	},
	{
		id: 'cloud-diary',
		title: 'Read the sky',
		subject: 'earth',
		concepts: ['weather', 'water-cycle', 'measurement'],
		question: 'How do clouds change during a day?',
		materials: 'paper|1 sheet;crayons|3;clock|1',
		steps: [
			'From a safe shaded spot, sketch the visible sky without looking toward the Sun.',
			'Repeat at three times during the day, noting the time and general weather.',
			'Compare cloud shapes, coverage, and apparent movement.'
		],
		explanation:
			'Clouds consist of tiny water droplets, ice crystals, or both. Their appearance changes with conditions and air movement. A few observations are a record, not a reliable weather forecast.',
		observe: 'Use categories such as clear, partly cloudy, and mostly cloudy, with sketches.',
		kind: 'observation',
		setting: 'outdoor',
		wait: 360,
		safety: 'Never look directly at the Sun. Observe indoors if weather becomes unsafe.'
	},
	{
		id: 'condensation-cup',
		title: 'Water on the outside',
		subject: 'earth',
		concepts: ['water-cycle', 'states-of-matter', 'heat-transfer'],
		question: 'Where do droplets outside a cold cup come from?',
		materials: 'clear cups|2;water|1 cup;ice cubes|3;paper towel|1 sheet',
		steps: [
			'Dry the outside of two cups and put equal amounts of water inside.',
			'Add ice to one cup and leave the other at room temperature.',
			'Wait ten minutes and compare the outside surfaces without spilling any water.'
		],
		explanation:
			'Water vapor in surrounding air can condense into liquid on a sufficiently cold surface. The droplets outside the cup come from the air; they do not pass through the cup wall.',
		observe: 'Check which cup develops outside droplets. Dry air may produce few or none.',
		wait: 10,
		safety: 'Use plastic cups and dry spills promptly.'
	},
	{
		id: 'wind-ribbons',
		title: 'Draw the wind’s direction',
		subject: 'earth',
		concepts: ['weather', 'air', 'measurement'],
		question: 'Does the wind keep moving in the same direction?',
		materials: 'ribbon|1 short length;cardboard tube|1;tape|1 roll;paper|1 sheet',
		steps: [
			'Tape a short ribbon to a cardboard tube held upright.',
			'Stand in one safe open place and note the direction the ribbon points.',
			'Draw its direction every minute for ten minutes, including times when it hangs still.'
		],
		explanation:
			'Moving air pushes the ribbon. It points roughly toward where the wind is going; weather reports name wind by the direction it comes from.',
		observe: 'Record direction changes and how steadily the ribbon moves.',
		kind: 'observation',
		setting: 'outdoor',
		safety: 'Keep ribbon short and away from necks. Stay away from roads and power lines.'
	},
	{
		id: 'sun-warmed-surfaces',
		title: 'Light and dark in the sunshine',
		subject: 'earth',
		concepts: ['sunlight', 'heat-transfer', 'materials'],
		question: 'Do light and dark covers change how water warms in sunlight?',
		materials:
			'plastic cups|2 identical;water|1 cup;black paper|1 sheet;white paper|1 sheet;non-glass thermometer|1;tape|1 roll',
		steps: [
			'Wrap one cup in black paper and one in white paper, leaving their tops open.',
			'Fill with equal room-temperature water and measure both starting temperatures.',
			'Set side by side in sunlight for twenty minutes. Measure each again with the same thermometer.'
		],
		explanation:
			'Dark surfaces generally absorb more incoming visible light than light surfaces. Absorbed energy can warm the cup and water, while wind, material, and insulation also affect the result.',
		observe: 'Compare temperature changes, not just final temperatures.',
		setting: 'outdoor',
		wait: 20,
		adult: 'help',
		safety:
			'Use a non-glass thermometer within its rated range. An adult checks surfaces before touching.'
	},
	{
		id: 'shadow-clock',
		title: 'A clock made of shadows',
		subject: 'space',
		concepts: ['rotation', 'light', 'sunlight'],
		question: 'How does a fixed object’s shadow move during the day?',
		materials: 'cardboard tube|1;modeling clay|1 lump;paper|1 large sheet;crayons|1;clock|1',
		steps: [
			'Stand a cardboard tube upright with clay on paper in a safe sunny spot.',
			'Trace its shadow and label the time without moving the setup.',
			'Return each hour and trace again. Compare direction and length.'
		],
		explanation:
			'Earth’s rotation makes the Sun appear to move across the sky. The changing direction of sunlight changes a fixed object’s shadow. This simple shadow clock depends on place, date, and orientation.',
		observe: 'Compare shadow length and direction at each recorded time.',
		kind: 'observation',
		setting: 'outdoor',
		wait: 180,
		safety: 'Look only at shadows, never at the Sun. Secure the setup so it is not a trip hazard.'
	},
	{
		id: 'moon-ball',
		title: 'Why the Moon changes shape',
		subject: 'space',
		concepts: ['moon', 'light', 'orbits'],
		question: 'How can a ball look like different Moon phases?',
		materials: 'flashlight|1;large light-colored ball|1;chair|1',
		steps: [
			'An adult holds a flashlight at a fixed position in a dim room.',
			'Hold a large ball at arm’s length and slowly move it around your seated viewpoint.',
			'Look at how much of the lit half you can see. Keep your body from blocking the light.'
		],
		explanation:
			'Sunlight normally lights half the Moon. As it orbits Earth, we see different portions of that lit half. Everyday Moon phases are not caused by Earth’s shadow.',
		observe: 'Find a view resembling a crescent and one resembling a full Moon.',
		kind: 'observation',
		adult: 'help',
		safety: 'Use a clear space and keep the flashlight beam away from eyes.'
	},
	{
		id: 'day-night-globe',
		title: 'Turn day into night',
		subject: 'space',
		concepts: ['rotation', 'light', 'scale'],
		question: 'How can one spinning ball have daytime and nighttime?',
		materials: 'large ball|1;flashlight|1;removable sticker|1',
		steps: [
			'Put a sticker on a large ball to represent a place on Earth.',
			'An adult shines a fixed flashlight toward the ball in a dim room.',
			'Slowly rotate the ball and watch the sticker move into and out of the lit side.'
		],
		explanation:
			'Earth rotates, carrying places into sunlight and then away from it. This produces day and night. The model omits Earth’s scale and the great distance to the Sun.',
		observe: 'Identify sunrise, midday, and night for the sticker in your model.',
		kind: 'observation',
		adult: 'help',
		safety: 'Do not point the flashlight at eyes.'
	},
	{
		id: 'moon-journal',
		title: 'Meet the Moon again tomorrow',
		subject: 'space',
		concepts: ['moon', 'orbits', 'measurement'],
		question: 'How does the Moon’s visible shape change across several days?',
		materials: 'paper|7 sheets;crayons|2;clock|1',
		steps: [
			'With an adult, look for the Moon from a safe place when it is visible.',
			'Draw its lit shape and write the date and time; record cloudy or no-sighting days too.',
			'Repeat for a week and arrange the drawings in date order.'
		],
		explanation:
			'The Moon’s visible illuminated portion changes as it orbits Earth. It is not visible at the same time or in the same place every day, and clouds can hide it.',
		observe: 'Describe how the lit part changes without filling in nights you did not observe.',
		kind: 'observation',
		setting: 'outdoor',
		minutes: 10,
		wait: 10080,
		safety:
			'Observe with an adult from a familiar safe spot. Never look toward the Sun while searching for a daytime Moon.'
	},
	{
		id: 'constellation-perspective',
		title: 'A constellation changes its view',
		subject: 'space',
		concepts: ['scale', 'light', 'measurement'],
		question: 'Does a pattern look the same from another viewpoint?',
		materials: 'cardboard tubes|5;paper|1 sheet;crayons|1;removable stickers|5',
		steps: [
			'Put bright stickers on five tubes standing at different distances on a table.',
			'From one marked seated position, draw the pattern the stickers make.',
			'Move to the side and draw again, keeping the tubes fixed.'
		],
		explanation:
			'Constellations are patterns seen from Earth. Their stars are at different distances and are usually not a physically connected group. A change of viewpoint changes the apparent pattern.',
		observe: 'Compare relative sticker positions from both viewpoints.',
		kind: 'observation'
	},
	{
		id: 'crater-tray',
		title: 'Make a model crater',
		subject: 'space',
		concepts: ['gravity', 'forces', 'scale'],
		question: 'Does drop height change a dent in damp sand?',
		materials: 'damp play sand|1 shallow tray;large ball|1;ruler|1;spoon|1',
		steps: [
			'Smooth a shallow layer of damp play sand with a spoon.',
			'Drop a large ball from ten centimeters above the surface. Measure the dent width.',
			'Smooth again and repeat from twenty centimeters using the same ball. Repeat each height three times.'
		],
		explanation:
			'A falling object gains speed as gravity pulls it downward. On impact it transfers energy to the surface. Damp-sand dents model only part of the much more energetic process that makes impact craters.',
		observe: 'Record dent widths and whether the result repeats.',
		setting: 'either',
		safety:
			'Use damp sand to avoid dust and a ball too large to swallow. Keep hands clear and wash afterward.'
	},
	{
		id: 'planet-distance-walk',
		title: 'Walk a tiny solar system',
		subject: 'space',
		concepts: ['scale', 'orbits', 'measurement'],
		question: 'Are the planets evenly spaced from the Sun?',
		materials: 'paper|5 sheets;crayons|1;measuring tape|1',
		steps: [
			'Label cards Sun, Mercury, Venus, Earth, and Mars.',
			'Along a safe clear path, place the Sun at zero and cards at 39, 72, 100, and 152 centimeters.',
			'Compare the gaps. Explain that the cards show approximate average distances, not planet sizes or today’s positions.'
		],
		explanation:
			'This model uses one meter for Earth’s average distance from the Sun. Orbital distances are not evenly spaced. Real planets move around the Sun and do not stay lined up.',
		observe: 'Measure each neighboring gap and compare it with the distance from the Sun.',
		kind: 'build',
		setting: 'either',
		age: 7,
		safety: 'Keep cards out of walkways after the activity and use a safe clear area.'
	},
	{
		id: 'orbit-track',
		title: 'Trace an orbit',
		subject: 'space',
		concepts: ['orbits', 'scale', 'measurement'],
		question: 'How does an oval path differ from a circle?',
		materials: 'paper|1 large sheet;string|1 short loop;crayons|1;blunt pencils with erasers|2',
		steps: [
			'An adult holds two blunt pencils upright with their eraser ends on paper, a short distance apart, and loops string around them.',
			'Keep a crayon inside the loop and pull the string gently taut while tracing around the two fixed pencils.',
			'Try different pencil spacing with the same loop and compare the oval paths.'
		],
		explanation:
			'An ellipse has two focal points, and the total distance to them stays constant around the curve. Planets have elliptical orbits with the Sun at one focus; most planetary orbits are much closer to circles than an exaggerated oval.',
		observe: 'Compare how stretched the paths become as the two supports move apart.',
		kind: 'build',
		adult: 'help',
		age: 7,
		safety: 'Use short string under adult supervision, with no pins or sharp supports.'
	},
	{
		id: 'paper-bridge',
		title: 'A bridge from one sheet',
		subject: 'engineering',
		concepts: ['structures', 'forces', 'materials', 'design'],
		question: 'Can folds help paper support a bigger load?',
		materials: 'paper|2 equal sheets;books|2 equal stacks;large building blocks|6',
		steps: [
			'Set two short book stacks a hand-width apart on the floor and span them with flat paper.',
			'Add large blocks one at a time in the center, stopping when the paper bends down.',
			'Fold the second sheet into an accordion, keep the same gap, and compare the supported load.'
		],
		explanation:
			'Folding changes a sheet’s cross-sectional shape and can increase its resistance to bending. Engineers choose shapes as well as materials when designing structures.',
		observe: 'Record the supported blocks and how each bridge bends.',
		kind: 'build',
		safety: 'Use low supports on the floor and light blocks too large to swallow.'
	},
	{
		id: 'tower-base',
		title: 'Give a tower a steady base',
		subject: 'engineering',
		concepts: ['structures', 'balance', 'gravity', 'design'],
		question: 'How does base width affect a tower’s stability?',
		materials: 'large building blocks|12;cardboard|1 sheet;books|1 thin',
		steps: [
			'Build a short narrow tower on cardboard using six blocks.',
			'An adult slowly lifts one edge of the cardboard with a thin book until the tower tips; keep hands out of its path.',
			'Use the same six blocks for a wider base and repeat. Keep the tower’s height as similar as possible.'
		],
		explanation:
			'A tower tips when its center of mass moves beyond its supporting base. A wider base often improves stability, but changing height or weight distribution can also change the result.',
		observe: 'Compare how far the cardboard can tilt before tipping.',
		kind: 'build',
		adult: 'help',
		safety: 'Build on the floor with lightweight blocks and keep towers below knee height.'
	},
	{
		id: 'paper-helicopter',
		title: 'A paper spinner takes flight',
		subject: 'engineering',
		concepts: ['air', 'gravity', 'design'],
		question: 'Can folded paper wings make a falling strip spin?',
		materials: 'paper|1 sheet;child scissors|1 pair;tape|1 small piece',
		steps: [
			'An adult helps cut a wide paper strip, then cuts halfway down the middle from its top.',
			'Fold the two top flaps in opposite directions and fold the bottom into a narrow handle.',
			'Drop from shoulder height without throwing. Adjust one wing fold at a time and repeat.'
		],
		explanation:
			'Air pushes on the angled paper wings during a fall, producing a turning effect. The spinning paper interacts with air differently from a flat strip.',
		observe: 'Record which wing arrangements spin consistently.',
		kind: 'build',
		adult: 'help',
		safety: 'Supervise scissors and drop without climbing or aiming at people.'
	},
	{
		id: 'waterproof-roof',
		title: 'Build a rainy-day roof',
		subject: 'engineering',
		concepts: ['materials', 'water-cycle', 'design'],
		question: 'Which household material keeps a paper house dry?',
		materials:
			'paper|2 sheets;aluminum foil|1 small sheet;cloth|1 small piece;plastic cup|1;water|3 tablespoons;tray|1',
		steps: [
			'Put a small dry paper square inside a cup on a tray.',
			'Cover the cup with paper, cloth, or foil as a roof. Pour one tablespoon of water gently onto it.',
			'Use a fresh dry interior paper square for each roof and compare how wet it becomes.'
		],
		explanation:
			'Materials differ in how they absorb or block liquid water. A useful roof also needs the right shape and secure seams; waterproof material alone does not guarantee a dry house.',
		observe: 'Compare leaks and absorbed water for each roof.',
		kind: 'build',
		safety: 'Use small amounts of water and wipe spills.'
	},
	{
		id: 'cardboard-lever',
		title: 'Lift with a little lever',
		subject: 'engineering',
		concepts: ['forces', 'balance', 'design'],
		question: 'Does moving a lever’s support change how hard it feels to lift a load?',
		materials: 'sturdy cardboard|1 strip;wooden block|1 large;modeling clay|1 lump',
		steps: [
			'Rest a sturdy cardboard strip across a low block on the floor.',
			'Put clay near one end and press the other end gently to lift it.',
			'Move the support closer to the clay and try again with the same clay load.'
		],
		explanation:
			'A lever turns around a support called a fulcrum. A longer effort arm can reduce the force needed, but the effort end must move farther for the same lift.',
		observe:
			'Compare effort and movement distance, noting that your hand’s impression is not a precise force measurement.',
		kind: 'build',
		safety: 'Use only a small clay load, press slowly, and never flick or launch it.'
	},
	{
		id: 'rolling-load',
		title: 'Move a load on rollers',
		subject: 'engineering',
		concepts: ['friction', 'forces', 'design'],
		question: 'Can rollers make moving a small box easier?',
		materials: 'small cardboard box|1;paper tubes|3;large building blocks|2;cardboard|1 sheet',
		steps: [
			'Put two large blocks in a small box and push it slowly across a flat cardboard surface.',
			'Place three paper tubes underneath the same box as rollers.',
			'Push gently again and compare. Move the rear roller to the front as the box travels.'
		],
		explanation:
			'Rolling changes the contact motion between a load and a surface. It can require less force than sliding, although soft tubes may flatten and increase resistance.',
		observe: 'Describe effort and whether rollers keep their shape.',
		kind: 'build',
		safety: 'Keep loads light and fingers away from underneath the box.'
	},
	{
		id: 'paper-cup-phone',
		title: 'Send a whisper along a string',
		subject: 'engineering',
		concepts: ['sound', 'materials', 'design'],
		question: 'Does string tension change how a cup telephone works?',
		materials: 'paper cups|2;string|1 meter;tape|1 roll;blunt pencil|1 for adult use only',
		steps: [
			'An adult makes a small hole in each cup bottom and secures string through both with knots and tape.',
			'Stand far enough apart to gently tighten the string. Speak softly into one cup while listening at the other.',
			'Compare with slack string, keeping your voice and distance similar.'
		],
		explanation:
			'A voice vibrates the first cup, and a taut string can carry vibrations to the other cup. A slack string usually transfers them less effectively. Sound through the air can still be heard too.',
		observe: 'Compare clear words heard through the cup with taut and slack string.',
		kind: 'build',
		adult: 'help',
		safety:
			'Only an adult makes holes. Keep string away from necks and walkways; never shout into the phone.'
	},
	{
		id: 'absorbent-cleanup',
		title: 'Design a better spill helper',
		subject: 'engineering',
		concepts: ['capillary-action', 'materials', 'design'],
		question: 'Which equal-sized material picks up more of a small spill?',
		materials:
			'paper towel|1 square;cloth|1 equal square;paper|1 equal square;water|3 tablespoons;tray|1;spoon|1',
		steps: [
			'An adult prepares equal-sized dry pieces of cloth, paper, and paper towel.',
			'Place one tablespoon of water on a tray and lay the first material on it for ten seconds.',
			'Lift it and compare remaining water. Dry the tray and repeat with each other material.'
		],
		explanation:
			'Porous materials take up water in spaces between fibers. Material thickness and pore structure affect absorption, so equal area does not always mean equal material amount.',
		observe: 'Compare the water left behind and discuss whether thickness was a fair comparison.',
		kind: 'build',
		safety: 'Use a tray and dry the work area afterward.'
	},
	{
		id: 'ramp-release-height',
		title: 'Give a rolling ball a higher start',
		subject: 'physics',
		concepts: ['gravity', 'forces', 'measurement'],
		question: 'Does release height change how far a ball rolls beyond a ramp?',
		materials: 'cardboard|1 sturdy sheet;books|2;large ball|1;measuring tape|1;tape|1 roll',
		steps: [
			'Make a low ramp on the floor and mark three starting positions along it.',
			'Release the same ball without pushing from each mark and measure travel beyond the ramp.',
			'Repeat each position three times, keeping the ramp and landing surface fixed.'
		],
		explanation:
			'A higher starting point gives the ball more gravitational potential energy. During its descent this becomes motion; friction and deformation eventually stop the ball.',
		observe:
			'Compare travel distances for each starting position, including variation between repeats.',
		safety: 'Use a ball too large to swallow and a clear floor away from stairs.'
	},
	{
		id: 'paper-fall-shapes',
		title: 'One sheet, two ways to fall',
		subject: 'physics',
		concepts: ['air', 'gravity', 'materials'],
		question: 'Will flat and crumpled sheets of the same paper fall together?',
		materials: 'paper|2 matching sheets;measuring tape|1',
		steps: [
			'Keep one sheet flat and crumple the other into a loose ball.',
			'Hold both at the same shoulder height and release together without throwing.',
			'Repeat, swapping which hand holds each shape, and watch how each moves.'
		],
		explanation:
			'Both sheets are pulled downward by gravity. The broad flat sheet usually experiences greater air resistance relative to its weight, so its fall differs from the crumpled sheet.',
		observe: 'Record which arrives first and whether the flat sheet tilts or flutters.',
		safety: 'Stand on the floor without climbing and keep the landing space clear.'
	},
	{
		id: 'soft-ball-bounces',
		title: 'How high is the next bounce?',
		subject: 'physics',
		concepts: ['forces', 'gravity', 'measurement'],
		question: 'Does a soft ball return to its release height after bouncing?',
		materials: 'soft ball|1;paper|1 large sheet;tape|1 roll;ruler|1',
		steps: [
			'Tape a paper height scale low on a wall beside a clear floor.',
			'Release a soft ball from a marked height without pushing and watch its first rebound.',
			'Repeat five times from that height and compare the rebound with the release mark.'
		],
		explanation:
			'A ball deforms on impact and pushes back as it recovers. Some energy spreads into sound, heat, and deformation, so the rebound usually reaches less than the release height.',
		observe: 'Estimate a range of rebound heights rather than claiming an exact reading.',
		safety: 'Use a soft ball too large to swallow and keep faces away from the bounce.'
	},
	{
		id: 'pendulum-length',
		title: 'A longer swing takes its time',
		subject: 'physics',
		concepts: ['gravity', 'forces', 'measurement'],
		question: 'How does string length affect the time for ten gentle swings?',
		materials: 'string|1 length of 40 centimeters;soft fabric pouch|1 small;timer|1;ruler|1',
		steps: [
			'An adult ties the soft pouch securely to the string and holds the free end still.',
			'Pull the pouch a little to one side, release, and time ten complete back-and-forth swings.',
			'Shorten the free string to twenty centimeters and repeat with the same small starting angle.'
		],
		explanation:
			'Gravity pulls a displaced pendulum back toward its lowest point. For small swings, a longer pendulum takes more time per swing than a shorter one.',
		observe: 'Compare times over three trials at each length.',
		age: 7,
		adult: 'help',
		safety:
			'An adult controls the short string. Use a soft pouch, a small swing, and clear space away from faces.'
	},
	{
		id: 'light-through-materials',
		title: 'Let a little light through',
		subject: 'physics',
		concepts: ['light', 'materials'],
		question: 'Which materials transmit, scatter, or block a flashlight beam?',
		materials:
			'flashlight|1;clear plastic lid|1;wax paper|1 piece;cardboard|1 piece;white paper|1 sheet',
		steps: [
			'Shine a flashlight toward a white paper screen and mark the light and screen positions.',
			'Hold each material halfway between them, one at a time.',
			'Compare the brightness and edges of the patch on the screen.'
		],
		explanation:
			'Transparent materials transmit much of the light with little scattering. Translucent materials scatter transmitted light, while opaque materials block it from passing through.',
		observe: 'Sort the samples by the light patterns you actually see.',
		safety: 'Use smooth plastic and aim the flashlight away from eyes.'
	},
	{
		id: 'mirror-light-path',
		title: 'Steer a spot of light',
		subject: 'physics',
		concepts: ['reflection', 'light', 'measurement'],
		question: 'How does turning a mirror change where reflected light lands?',
		materials: 'unbreakable mirror|1;flashlight|1;white paper|2 sheets;crayon|1',
		steps: [
			'An adult aims a flashlight at an unbreakable mirror so the reflection lands on paper.',
			'Keep the flashlight still and gently turn the mirror a small amount.',
			'Mark the new light patch and repeat for several mirror positions.'
		],
		explanation:
			'A mirror reflects light in a direction set by its surface angle. Turning the mirror changes the reflected path even when the incoming light stays fixed.',
		observe: 'Draw arrows showing how the reflected spot moves as the mirror turns.',
		adult: 'help',
		safety:
			'Use a flashlight only, never sunlight or a laser. Keep direct and reflected beams away from eyes.'
	},
	{
		id: 'water-pencil-bend',
		title: 'A pencil that seems to bend',
		subject: 'physics',
		concepts: ['light', 'senses', 'materials'],
		question: 'How does a pencil look where it enters water?',
		materials: 'clear plastic cup|1;water|half a cup;pencil|1;paper|1 sheet',
		steps: [
			'Put a pencil at a slant in an empty clear cup and draw its outline.',
			'Add water halfway up the cup and look from the side.',
			'Change your viewing position and compare the apparent pencil shape.'
		],
		explanation:
			'Light changes direction as it travels between water and air. This refraction changes the apparent position of the underwater part even though the pencil stays straight.',
		observe: 'Sketch the pencil at the waterline from two viewpoints.',
		kind: 'observation',
		safety: 'Use a plastic cup, keep the pencil away from faces, and dry spills.'
	},
	{
		id: 'water-arrow-view',
		title: 'An arrow seen through a water cup',
		subject: 'physics',
		concepts: ['light', 'senses', 'scale'],
		question: 'Can a round water-filled cup change the apparent direction of an arrow?',
		materials: 'smooth round clear plastic cup|1;water|1 cup;paper|1 sheet;marker|1;ruler|1',
		steps: [
			'Draw a bold sideways arrow and view it through an empty round cup.',
			'Fill the cup with water and put the arrow several centimeters behind it.',
			'Move the arrow farther back in small steps and record how its image changes.'
		],
		explanation:
			'Curved water surfaces refract light like a lens. At some distances, rays cross and the arrow can appear reversed; cup shape and viewing distance affect the result.',
		observe: 'Record positions where the arrow looks enlarged, distorted, or reversed.',
		safety: 'Use a plastic cup and keep this activity away from direct sunlight.'
	},
	{
		id: 'two-light-shadows',
		title: 'One object makes two shadows',
		subject: 'physics',
		concepts: ['light', 'measurement'],
		question: 'What changes when a second flashlight shines on the same object?',
		materials: 'flashlights|2;large building block|1;white paper|1 sheet',
		steps: [
			'Stand a block in front of a paper screen and shine one flashlight toward it.',
			'Add a second flashlight from the side without moving the block.',
			'Switch each light off in turn and compare the shadow positions and darkness.'
		],
		explanation:
			'Each light produces a shadow where the object blocks its rays. A region shadowed from one light may still receive light from the other.',
		observe: 'Draw which shadow belongs to each flashlight and where shadows overlap.',
		safety: 'Point both flashlights at the screen and away from eyes.'
	},
	{
		id: 'sound-muffling',
		title: 'Wrap up a quiet sound',
		subject: 'physics',
		concepts: ['sound', 'materials', 'measurement'],
		question: 'Does a cloth covering change how clearly we hear a ticking timer?',
		materials: 'ticking mechanical timer|1;cloth|1;small cardboard box|1;paper|1 sheet',
		steps: [
			'Set a ticking timer on a table and listen from a marked seat.',
			'Place the timer in an open box, then cover the box with cloth.',
			'Compare uncovered and covered trials from the same seat without changing the timer.'
		],
		explanation:
			'Materials can absorb, reflect, and transmit sound. A covering can reduce the sound reaching a listener, but gaps and the box itself also influence what is heard.',
		observe: 'Describe changes in loudness and clarity using the same listener.',
		safety: 'Use a quiet mechanical timer, keep its controls with an adult, and avoid loud alarms.'
	},
	{
		id: 'tube-listening',
		title: 'Listen through a paper tube',
		subject: 'physics',
		concepts: ['sound', 'air', 'senses'],
		question: 'Does pointing a tube toward a quiet sound change what you hear?',
		materials: 'cardboard tube|1 wide;paper|1 sheet;chair|1',
		steps: [
			'Sit while an adult gently rustles paper at a fixed position across the table.',
			'Hold a wide tube near, but not against, one ear and aim toward the paper.',
			'Turn the tube away and compare, keeping the sound source in place.'
		],
		explanation:
			'A tube can guide sound along its air-filled interior and change which sounds reach the ear. Its shape can also emphasize some frequencies.',
		observe: 'Compare sound clarity with the tube aimed toward and away from the source.',
		safety: 'Never insert the tube into an ear or shout through it.'
	},
	{
		id: 'water-ripple-barrier',
		title: 'Send ripples around a corner',
		subject: 'physics',
		concepts: ['forces', 'measurement'],
		question: 'What happens to water ripples when they meet a gap in a barrier?',
		materials:
			'shallow tray|1;water|enough for 1 centimeter depth;large waterproof blocks|2;spoon|1',
		steps: [
			'Put shallow water in a tray and stand two blocks across the middle with a gap between them.',
			'Gently dip a spoon at one end to make small ripples.',
			'Watch beyond the gap, then change only the gap width and repeat.'
		],
		explanation:
			'Water ripples transfer a disturbance across the surface. Ripples can spread after passing through an opening; reflections from tray walls may overlap them.',
		observe: 'Sketch ripple shapes before and after the gap.',
		safety: 'Use a shallow tray away from electrical devices and wipe spills promptly.'
	},
	{
		id: 'floating-waterline',
		title: 'Watch a boat settle lower',
		subject: 'physics',
		concepts: ['buoyancy', 'forces', 'measurement'],
		question: 'How does adding a load change a floating container’s waterline?',
		materials:
			'wide plastic food container|1;large building blocks|4;water|1 shallow basin;washable marker|1',
		steps: [
			'Float an empty container upright in a shallow basin and mark its waterline.',
			'Add one large block at a time in the center and mark each new waterline.',
			'Remove the blocks one at a time and watch the container rise.'
		],
		explanation:
			'A floating container displaces water whose weight matches its total weight. Adding a load makes it sit deeper so it can displace more water.',
		observe: 'Compare the marks and describe what happens when the load is removed.',
		safety: 'Use a stable shallow basin and stop before water reaches the container rim.'
	},
	{
		id: 'trapped-air-cup',
		title: 'Keep a paper passenger dry underwater',
		subject: 'physics',
		concepts: ['air', 'states-of-matter', 'materials'],
		question: 'Can air inside an upside-down cup keep paper dry?',
		materials: 'clear plastic cup|1;paper towel|1 piece;water|1 basin deep enough to cover the cup',
		steps: [
			'An adult wedges a dry paper towel firmly into the bottom of a cup.',
			'Push the cup straight down, opening first, into the basin and lift it straight out.',
			'Check the paper, then repeat with fresh paper while tilting the submerged cup to release bubbles.'
		],
		explanation:
			'Air occupies space inside the inverted cup and limits water entry. Tilting lets air escape as bubbles, allowing more water to enter.',
		observe: 'Compare paper wetness and visible bubbles in the straight and tilted trials.',
		adult: 'help',
		safety:
			'An adult supervises the basin continuously, empties it immediately, and dries the floor.'
	},
	{
		id: 'air-fan-push',
		title: 'Move a paper sail with air',
		subject: 'physics',
		concepts: ['air', 'forces', 'measurement'],
		question: 'Does a hand fan move a paper sail from farther away?',
		materials: 'paper|2 sheets;cardboard|1 piece;ruler|1;tape|1 roll',
		steps: [
			'Fold one paper sheet into a tent that stands on a smooth table.',
			'Use cardboard as a fan, making five gentle strokes from twenty centimeters away.',
			'Reset the tent and repeat from forty centimeters using similar fan strokes.'
		],
		explanation:
			'Moving air pushes on the paper. Airflow spreads and changes with distance, so the force reaching the sail can differ even when fan motions seem similar.',
		observe:
			'Measure how far the tent moves and note that hand fanning is not perfectly consistent.',
		safety: 'Fan gently away from faces and keep the table clear.'
	},
	{
		id: 'balanced-hanger',
		title: 'Make a balance from a hanger',
		subject: 'physics',
		concepts: ['balance', 'forces', 'measurement'],
		question: 'Can matching cups on a hanger compare two light loads?',
		materials:
			'plastic hanger|1;paper cups|2;string|4 short pieces;tape|1 roll;large building blocks|4 matching',
		steps: [
			'An adult tapes short string handles to two cups and hangs them at equal distances from the hanger center.',
			'The adult holds the hanger by its hook while you add one block to each cup.',
			'Add an extra block to one cup, observe, then move that block to the other cup.'
		],
		explanation:
			'Equal weights at equal distances create matching turning effects. An extra weight makes one side turn downward; this simple balance compares loads rather than measuring exact mass.',
		observe: 'Record which side lowers and whether equal loads balance.',
		kind: 'build',
		adult: 'help',
		safety:
			'Use light loads and short strings; an adult holds the hanger away from faces and necks.'
	},
	{
		id: 'rolling-cylinders',
		title: 'Which way will a cylinder roll?',
		subject: 'physics',
		concepts: ['forces', 'friction', 'structures'],
		question: 'Does the orientation of a cylinder change its motion down a slope?',
		materials: 'cardboard tube|1;cardboard|1 sturdy sheet;book|1;tape|1 roll',
		steps: [
			'Make a shallow ramp on the floor and mark a release line.',
			'Lay a tube across the ramp and release it without pushing.',
			'Turn the tube so its length points downhill, release from the same line, and compare.'
		],
		explanation:
			'A cylinder can roll around its long axis. When that axis points downhill, it may slide instead; friction and small surface irregularities affect the path.',
		observe: 'Describe rolling, sliding, turning, or staying still over three repeats.',
		safety: 'Use a low ramp with a clear landing area away from stairs.'
	},
	{
		id: 'spoon-ice-melting',
		title: 'Which spoon melts ice first?',
		subject: 'physics',
		concepts: ['heat-transfer', 'states-of-matter', 'materials'],
		question: 'How does ice melt on a metal spoon compared with a wooden spoon?',
		materials: 'metal spoon|1;wooden spoon|1;ice cubes|2 small matching;tray|1;timer|1',
		steps: [
			'Leave both spoons in the same room until they are at room temperature.',
			'Rest them on a tray and place a small matching ice cube in each bowl.',
			'Compare the ice every two minutes without holding or moving the spoons.'
		],
		explanation:
			'Metal usually transfers heat to ice faster than wood. Spoon shape, thickness, and contact area also affect melting, so this comparison does not isolate material alone.',
		observe: 'Record visible ice remaining and differences in spoon size.',
		wait: 10,
		fairTest:
			'Use similarly sized spoons and equal ice cubes. Record shape differences as possible influences and repeat after both spoons return to room temperature.',
		safety: 'Handle spoons by their handles and wipe meltwater.'
	},
	{
		id: 'sugar-grain-size',
		title: 'Small grains dissolve sooner',
		subject: 'chemistry',
		concepts: ['dissolving', 'materials', 'measurement'],
		question: 'Does crushing a sugar cube change how quickly it dissolves?',
		materials: 'sugar cubes|2 matching;clear cups|2;water|1 cup;spoon|1;small bowl|1;timer|1',
		steps: [
			'An adult crushes one cube with a spoon in a bowl, keeping all the sugar.',
			'Put equal room-temperature water in two cups and add the whole cube to one and crushed sugar to the other.',
			'Leave both unstirred and compare visible sugar at one-minute intervals.'
		],
		explanation:
			'Crushing exposes more sugar surface to water. With more surface available for dissolving, small pieces often disappear sooner than a single compact cube.',
		observe: 'Record when each sample has no visible solid sugar.',
		adult: 'help',
		safety: 'Crush gently without making dust and do not taste the mixtures.'
	},
	{
		id: 'dissolving-limit',
		title: 'When water cannot hide more salt',
		subject: 'chemistry',
		concepts: ['dissolving', 'mixtures', 'measurement'],
		question: 'Will every added spoonful of salt dissolve in the same small cup of water?',
		materials: 'water|4 tablespoons;salt|4 teaspoons;clear cup|1;teaspoon|1;timer|1',
		steps: [
			'Put four tablespoons of room-temperature water in a clear cup.',
			'Add salt half a teaspoon at a time, stirring for one minute after each addition.',
			'Stop when grains remain after an extra two minutes of stirring and record the total added.'
		],
		explanation:
			'A fixed amount of water can dissolve only a limited amount of salt at a given temperature. Undissolved grains can remain once the solution is saturated, though slow dissolving can also leave temporary grains.',
		observe: 'Distinguish grains that disappear with more stirring from persistent residue.',
		safety: 'Do not taste the salt water and wipe spills.'
	},
	{
		id: 'water-amount-dissolving',
		title: 'Give salt more room to dissolve',
		subject: 'chemistry',
		concepts: ['dissolving', 'mixtures', 'measurement'],
		question: 'Does adding more water help dissolve salt that remains at the bottom?',
		materials: 'clear cups|2;water|8 tablespoons;salt|4 teaspoons;teaspoon|1',
		steps: [
			'Put two tablespoons of water and two teaspoons of salt in each cup; stir equally.',
			'Check that grains remain, then add four tablespoons of water to only one cup.',
			'Stir both again for the same time and compare the remaining grains.'
		],
		explanation:
			'More water can dissolve more salt at the same temperature. Adding water reduces the concentration and may allow previously undissolved salt to enter solution.',
		observe: 'Compare visible residue before and after adding water.',
		safety: 'Do not taste mixtures; wash hands after cleanup.'
	},
	{
		id: 'salt-sand-separation',
		title: 'Separate a salty sandy mixture',
		subject: 'chemistry',
		concepts: ['mixtures', 'dissolving', 'materials'],
		question: 'Can water and a filter separate salt from clean sand?',
		materials:
			'clean damp play sand|1 tablespoon;salt|1 teaspoon;water|half a cup;coffee filter|1;plastic funnel|1;clear cups|2;spoon|1;shallow dish|1',
		steps: [
			'Stir sand and salt into water until the salt grains are no longer visible.',
			'An adult supports a filter in a funnel over the second cup while you slowly pour the mixture through.',
			'Inspect the trapped sand and leave a spoonful of filtered liquid in a dish to dry naturally.'
		],
		explanation:
			'Salt dissolves in water while sand does not. A filter traps sand but lets dissolved salt through; evaporating the water can reveal the salt again.',
		observe: 'Compare the filter residue with what remains in the dried dish.',
		wait: 4320,
		adult: 'help',
		safety: 'Use damp sand to avoid dust. Filtered liquid is not drinking water; never taste it.'
	},
	{
		id: 'filter-size-sort',
		title: 'Which pieces pass through?',
		subject: 'chemistry',
		concepts: ['mixtures', 'materials', 'measurement'],
		question: 'How does opening size change which paper pieces a screen separates?',
		materials: 'paper|2 sheets;child scissors|1 pair;colander|1;fine kitchen sieve|1;tray|1',
		steps: [
			'An adult helps cut paper into several sizes, including pieces smaller and larger than the colander holes.',
			'Gently shake the mixture over a tray using the colander and compare what passes through.',
			'Recombine the pieces and repeat with the fine sieve.'
		],
		explanation:
			'Screens separate solid mixtures by the sizes and shapes of openings. A piece must fit through an opening; turning or folding can change whether it passes.',
		observe: 'Sort the passed and retained pieces and note any folded exceptions.',
		adult: 'help',
		safety: 'Supervise scissors, keep paper pieces out of mouths, and clean up all scraps.'
	},
	{
		id: 'washable-ink-water',
		title: 'Which marks move with water?',
		subject: 'chemistry',
		concepts: ['dissolving', 'mixtures', 'materials'],
		question: 'Do crayon, pencil, and washable marker marks respond alike to water?',
		materials:
			'paper|1 sheet;wax crayon|1;pencil|1;washable marker|1;water|1 teaspoon;dropper|1;tray|1',
		steps: [
			'Draw three similar lines with crayon, pencil, and washable marker on paper in a tray.',
			'Add three water drops to the center of each line.',
			'Wait two minutes and compare spreading, fading, and the color of the wet area.'
		],
		explanation:
			'Some marker dyes dissolve and travel with water. Wax does not readily dissolve in water, and graphite behaves differently again, so the marks need not spread alike.',
		observe: 'Draw the shape of each wet mark after the same waiting time.',
		safety: 'Use washable water-based markers and keep supplies out of mouths.'
	},
	{
		id: 'wax-water-beads',
		title: 'Water beads on a waxy page',
		subject: 'chemistry',
		concepts: ['surface-tension', 'materials', 'capillary-action'],
		question: 'How does rubbing wax crayon onto paper change a water drop?',
		materials: 'paper|1 sheet;wax crayon|1;water|1 teaspoon;dropper|1;tray|1',
		steps: [
			'Color a small patch of paper heavily with wax crayon and leave a neighboring patch bare.',
			'Place matching water drops on both patches while the paper lies flat in a tray.',
			'Observe immediately and after one minute, comparing spreading and soaking.'
		],
		explanation:
			'Wax resists wetting by water and covers some paper fibers. Water tends to bead on the waxy patch while bare paper can draw it into spaces between fibers.',
		observe: 'Compare drop outlines and how quickly each patch becomes wet.',
		safety: 'Keep water on the tray and do not taste the supplies.'
	},
	{
		id: 'drop-size-surfaces',
		title: 'A drop takes a different shape',
		subject: 'chemistry',
		concepts: ['surface-tension', 'materials', 'measurement'],
		question: 'Do equal water drops spread equally on foil and a plastic lid?',
		materials:
			'aluminum foil|1 smooth square;plastic lid|1 flat;water|1 teaspoon;dropper|1;ruler|1;tray|1',
		steps: [
			'Wash and dry a flat plastic lid and smooth foil, placing both level in a tray.',
			'Use the same dropper to put one drop on each surface without touching it.',
			'Compare the widths from above and repeat on fresh dry areas.'
		],
		explanation:
			'A drop shape depends on attraction within water and between water and the surface. Surface coatings and traces of soap or oil can change how much a drop spreads.',
		observe: 'Estimate drop width and record whether it looks rounded or flat.',
		safety: 'Fold foil edges inward and dry the work area afterward.'
	},
	{
		id: 'water-drops-merge',
		title: 'Two drops become one',
		subject: 'chemistry',
		concepts: ['surface-tension', 'forces', 'measurement'],
		question: 'What happens when two water drops touch on a smooth lid?',
		materials: 'plastic lid|1 flat;water|1 teaspoon;dropper|1;tray|1',
		steps: [
			'Place two drops close together on a clean, dry plastic lid in a tray.',
			'Gently tilt the lid until one drop touches the other.',
			'Repeat with a smaller and a larger pair, watching their shapes immediately after contact.'
		],
		explanation:
			'When water drops meet, they can merge. Surface tension tends to reduce the exposed surface area, helping the joined water pull into a new rounded shape.',
		observe: 'Sketch the drops just before and just after they touch.',
		safety: 'Tilt gently over the tray and wipe up spills.'
	},
	{
		id: 'soap-drop-spread',
		title: 'A tiny bit of soap changes a drop',
		subject: 'chemistry',
		concepts: ['surface-tension', 'mixtures', 'measurement'],
		question: 'Does dilute dish soap change how water spreads on a plastic lid?',
		materials:
			'water|4 tablespoons;dish soap|1 drop;small cups|2;plastic lids|2 matching;droppers|2;tray|1',
		steps: [
			'Put two tablespoons of water in each cup and add one soap drop to only one.',
			'Use separate droppers to place one drop of each liquid on matching clean lids.',
			'Compare the spread and repeat on newly washed, rinsed, and dried lids.'
		],
		explanation:
			'Soap changes water surface tension and its interactions with a surface. Dilute soapy water often spreads more, though the plastic and any residue also matter.',
		observe: 'Compare drop outlines without mixing the two droppers.',
		safety: 'Keep soap away from eyes, do not taste the liquids, and rinse surfaces afterward.'
	},
	{
		id: 'color-diffusion-still',
		title: 'Color spreads without a spoon',
		subject: 'chemistry',
		concepts: ['mixtures', 'measurement'],
		question: 'How does a drop of food coloring spread in still water?',
		materials: 'clear cup|1;water|1 cup;food coloring|1 drop;paper|1 sheet;timer|1',
		steps: [
			'Place room-temperature water on a steady table and let it rest for five minutes.',
			'An adult adds one food-coloring drop gently without stirring.',
			'Sketch the color immediately and every two minutes for ten minutes without moving the cup.'
		],
		explanation:
			'Dissolved particles spread through molecular motion, called diffusion. Visible swirls also show bulk water motion and density differences, so this cup does not isolate diffusion alone.',
		observe: 'Record swirls and gradual spreading as separate features.',
		wait: 10,
		kind: 'observation',
		adult: 'help',
		safety: 'Protect surfaces from stains and do not drink the experimental water.'
	},
	{
		id: 'oil-drop-breakup',
		title: 'Stir oil into smaller droplets',
		subject: 'chemistry',
		concepts: ['mixtures', 'density', 'measurement'],
		question: 'Does longer stirring change the initial size of oil droplets in water?',
		materials: 'clear cups|2;water|1 cup;cooking oil|2 teaspoons;spoons|2;timer|1',
		steps: [
			'Put equal water and one teaspoon of oil into each cup.',
			'Stir one cup gently for five seconds and the other for twenty seconds at a similar pace.',
			'Compare droplets immediately after each stirring period and again after five minutes.'
		],
		explanation:
			'Stirring can break an oil layer into droplets without dissolving it. The droplets can join together again and rise because cooking oil is usually less dense than water.',
		observe: 'Compare droplet sizes and how the appearance changes during rest.',
		wait: 5,
		safety: 'Do not taste the mixture and wipe oily spills thoroughly.'
	},
	{
		id: 'dilution-color-ladder',
		title: 'Make a ladder of paler colors',
		subject: 'chemistry',
		concepts: ['mixtures', 'measurement'],
		question: 'How does adding water change the appearance of colored water?',
		materials:
			'clear cups|3 matching;water|12 tablespoons;food coloring|1 drop;tablespoon|1;white paper|1 sheet',
		steps: [
			'Mix one drop of food coloring into six tablespoons of water in the first cup.',
			'Move two tablespoons to the second cup and add two tablespoons of plain water.',
			'Move two tablespoons from the second cup to the third and add two tablespoons of water; compare against white paper.'
		],
		explanation:
			'Dilution spreads the same dissolved coloring through more water, reducing its concentration. Matching cups and equal final liquid depths make the visible color comparison more useful.',
		observe: 'The cups each finish with four tablespoons; order them by color intensity.',
		age: 7,
		safety: 'Protect surfaces from food-coloring stains and do not drink the mixtures.'
	},
	{
		id: 'evaporation-opening',
		title: 'A wider opening lets water escape',
		subject: 'chemistry',
		concepts: ['evaporation', 'water-cycle', 'measurement'],
		question: 'Does exposed surface area affect how fast water evaporates?',
		materials: 'wide shallow dish|1;narrow cup|1;water|4 tablespoons;tablespoon|1',
		steps: [
			'Put two tablespoons of water in a wide dish and two in a narrow cup.',
			'Set both side by side away from sunlight and drafts.',
			'Check daily until one is dry, then measure the water remaining in the other.'
		],
		explanation:
			'Evaporation occurs at the liquid surface. A wider exposed surface often allows faster water loss under similar conditions, although different containers can also affect temperature.',
		observe: 'Record time to dry and remaining water rather than comparing water depth alone.',
		wait: 4320,
		safety:
			'Keep containers away from pets and food preparation and empty them after the comparison.'
	},
	{
		id: 'covered-water-loss',
		title: 'A lid slows water loss',
		subject: 'chemistry',
		concepts: ['evaporation', 'water-cycle', 'states-of-matter'],
		question: 'Does covering a cup reduce water loss over several days?',
		materials: 'clear cups|2 matching;plastic lid|1 fitting;water|half a cup;washable marker|1',
		steps: [
			'Fill both cups to the same marked level with room-temperature water.',
			'Cover one cup and leave the other open in the same indoor location.',
			'Compare levels daily for three days without removing the lid.'
		],
		explanation:
			'An open cup lets water vapor escape into the room. A lid limits exchange with outside air; water can still evaporate and condense within the covered cup.',
		observe: 'Record water levels and any droplets inside the lid.',
		wait: 4320,
		safety:
			'Use room-temperature water only, keep cups out of reach of pets, and discard afterward.'
	},
	{
		id: 'frozen-water-expansion',
		title: 'Water needs more room as ice',
		subject: 'chemistry',
		concepts: ['states-of-matter', 'measurement'],
		question: 'How does the level of water change when it freezes?',
		materials:
			'flexible freezer-safe plastic cup|1;water|enough to half-fill the cup;washable marker|1;tray|1',
		steps: [
			'Half-fill a flexible freezer-safe cup and mark the water level.',
			'An adult places the open cup upright on a tray in the freezer overnight.',
			'Compare the ice level with the mark, then let it melt and check the liquid level again.'
		],
		explanation:
			'Water expands when it freezes because its solid structure takes up more space than the same mass of liquid water. The top may form an uneven mound rather than a flat line.',
		observe: 'Draw the frozen surface and compare the thawed level with the original mark.',
		wait: 1440,
		adult: 'help',
		safety:
			'Never use glass or a sealed container. An adult handles freezer items; do not hold ice against skin.'
	},
	{
		id: 'melting-floating-ice',
		title: 'Follow the waterline as floating ice melts',
		subject: 'chemistry',
		concepts: ['states-of-matter', 'buoyancy', 'measurement'],
		question: 'How much does the waterline change when floating ice melts?',
		materials: 'clear straight-sided cup|1;water|half a cup;ice cubes|2;washable marker|1;tray|1',
		steps: [
			'Put water and ice in a cup on a tray, ensuring the ice floats without resting on the bottom.',
			'Mark the waterline at eye level and leave the cup undisturbed.',
			'After all the ice melts, compare the waterline with the original mark.'
		],
		explanation:
			'Floating freshwater ice displaces approximately the same volume of water that it adds when it melts. The level should stay nearly unchanged; reading error and evaporation may affect the observation.',
		observe: 'Record whether any change is larger than the width of your mark.',
		wait: 60,
		safety: 'Do not taste the water and wipe condensation or spills.'
	},
	{
		id: 'sponge-air-bubbles',
		title: 'Watch air leave a sponge',
		subject: 'chemistry',
		concepts: ['mixtures', 'air', 'materials'],
		question: 'What escapes when a dry sponge is squeezed underwater?',
		materials: 'clean dry sponge|1;water|1 shallow bowl;tray|1',
		steps: [
			'Put a dry sponge into shallow water and watch without squeezing.',
			'Gently press it under the surface and squeeze once.',
			'Let it expand underwater and squeeze again, comparing bubbles with the first squeeze.'
		],
		explanation:
			'A dry sponge contains air in its pores. Squeezing underwater pushes some air out as bubbles, and releasing lets water enter the spaces; these bubbles are not evidence of a chemical reaction.',
		observe: 'Compare how many bubbles appear before and after the sponge fills with water.',
		safety: 'Use a new clean sponge without cleaning chemicals and dry spills.'
	},
	{
		id: 'seed-water-comparison',
		title: 'Which seeds get a drink?',
		subject: 'biology',
		concepts: ['plants', 'measurement'],
		question: 'How do matching seeds change on damp and dry paper towels?',
		materials: 'bean seeds|6;paper towels|2;clear containers|2;water|2 tablespoons',
		steps: [
			'Place three beans on a damp towel in one open container and three on a dry towel in another.',
			'Keep the containers together in a mild indoor spot, maintaining only the first towel damp.',
			'Sketch each seed daily for five days and count any roots that appear.'
		],
		explanation:
			'Seeds need water to begin germination. They also need suitable temperature and oxygen; even with water, some seeds may not be viable.',
		observe: 'Compare swelling and root emergence, recording every seed separately.',
		wait: 7200,
		safety:
			'Do not eat seeds. An adult discards any moldy setup without opening or handling it further; wash hands.'
	},
	{
		id: 'seed-root-turn',
		title: 'Roots find a new downward direction',
		subject: 'biology',
		concepts: ['plants', 'gravity', 'adaptation'],
		question: 'How does a young root grow after its container is turned?',
		materials:
			'sprouted bean seeds|2 with short roots;paper towels|2;clear rectangular containers|2;water|2 tablespoons;tape|1 roll',
		steps: [
			'An adult positions each sprouted bean against a container wall with a damp towel holding it gently in place.',
			'Keep one container upright and secure the other on its side without moving the seed inside.',
			'Keep towels damp and sketch root tips daily for three days.'
		],
		explanation:
			'Many roots respond to gravity by bending as they grow. The new growing tip can curve downward even when the older part points sideways.',
		observe: 'Mark the original root direction and draw only new growth in another color.',
		wait: 4320,
		adult: 'help',
		safety: 'Handle roots gently, never eat the seeds, and have an adult discard any moldy setup.'
	},
	{
		id: 'shoot-light-direction',
		title: 'A seedling leans toward a window',
		subject: 'biology',
		concepts: ['plants', 'sunlight', 'adaptation'],
		question: 'Does the direction of window light affect new shoot growth?',
		materials: 'potted seedlings|2 similar;paper|1 sheet;pencil|1;removable labels|2',
		steps: [
			'Place two similar seedlings beside the same bright window out of hot direct sun and label their window-facing sides.',
			'Keep both watered appropriately and sketch shoot direction for three days.',
			'Turn only one pot halfway around and observe new growth for three more days.'
		],
		explanation:
			'Many shoots grow toward light, a response called phototropism. Turning a pot changes the direction of incoming light relative to the stem, and new growth may curve.',
		observe: 'Compare growing tips and record plant differences that might affect the result.',
		wait: 8640,
		safety:
			'Use known non-toxic plants, keep pots secure away from edges, and wash hands after care.'
	},
	{
		id: 'leaf-vein-rubbings',
		title: 'Trace the roads inside a leaf',
		subject: 'biology',
		concepts: ['plants', 'adaptation', 'materials'],
		question: 'What vein patterns appear in leaf rubbings?',
		materials: 'clean fallen leaves|3 different;paper|3 sheets;wax crayons|2',
		steps: [
			'An adult chooses clean fallen leaves from known safe plants.',
			'Place each leaf vein-side up under paper and rub gently with the side of a crayon.',
			'Compare branching and parallel-looking vein patterns across the rubbings.'
		],
		explanation:
			'Leaf veins contain tissues that transport water and sugars and help support the leaf. Different plants have different vein arrangements, which a rubbing can reveal.',
		observe: 'Trace the main vein and several smaller branches on each rubbing.',
		kind: 'observation',
		safety: 'Avoid unknown, irritating, or moldy plants and wash hands afterward.'
	},
	{
		id: 'stem-ring-view',
		title: 'Explore the layers of a green onion',
		subject: 'biology',
		concepts: ['plants', 'adaptation', 'measurement'],
		question: 'What structures can we see in a cross-section of a green onion?',
		materials: 'green onion|1;knife|1 for adult use only;cutting board|1;paper|1 sheet;crayon|1',
		steps: [
			'An adult cuts across the pale base and a green leaf on a cutting board.',
			'Look at the cut faces without touching the knife and sketch the shapes.',
			'Compare the overlapping layers near the base with the hollow green leaf.'
		],
		explanation:
			'A green onion has overlapping leaf bases and tubular green leaves. Looking at cross-sections shows structures that are hidden when the plant is whole.',
		observe:
			'Count visible layers in your sample without assuming every onion has the same number.',
		kind: 'observation',
		adult: 'help',
		safety:
			'Only an adult handles the knife. Avoid onion contact with eyes, do not taste the samples, and wash hands.'
	},
	{
		id: 'celery-leaf-comparison',
		title: 'Do celery leaves change water use?',
		subject: 'biology',
		concepts: ['plants', 'evaporation', 'measurement'],
		question: 'Do similar celery stalks with and without leaves change cup water levels equally?',
		materials:
			'celery stalks|2 similar with leaves;clear cups|3 matching;water|1 cup;marker|1;child scissors|1 pair',
		steps: [
			'An adult removes the leaves from one stalk and leaves the other leafy.',
			'Put each stalk in a cup, add water, and mark each starting level; mark a third water-only cup too.',
			'Leave all three together for a day and compare the drops in water level.'
		],
		explanation:
			'Water evaporating from leaves can draw more water through a stalk. The water-only cup helps show background evaporation, but stalk differences and cutting also influence this comparison.',
		observe: 'Measure each cup’s change from its own starting mark.',
		wait: 1440,
		adult: 'help',
		safety:
			'Supervise scissors, keep experimental celery out of meals, and discard it after the activity.'
	},
	{
		id: 'green-onion-regrowth',
		title: 'Watch an onion grow again',
		subject: 'biology',
		concepts: ['plants', 'measurement'],
		question: 'Can a rooted green-onion base grow new leaves?',
		materials: 'rooted green-onion base|1;small clear cup|1;water|2 tablespoons;ruler|1',
		steps: [
			'An adult provides a green-onion base with roots and several centimeters of stem attached.',
			'Stand it in a little water covering the roots but not the whole base and place near indirect daylight.',
			'Replace the water daily and measure new growth for five days.'
		],
		explanation:
			'A living onion base can produce new leaves using stored resources. Water supports early regrowth, but this short demonstration does not show that a plant can thrive indefinitely in plain water.',
		observe: 'Measure leaf tips from the same reference point each day.',
		wait: 7200,
		safety:
			'An adult prepares the base. Do not eat the experimental onion; discard if slimy or moldy.'
	},
	{
		id: 'flower-visitor-count',
		title: 'Count visitors to a flower patch',
		subject: 'biology',
		concepts: ['plants', 'biodiversity', 'habitats'],
		question: 'Do two flower patches receive the same number of visible insect visits?',
		materials: 'paper|1 sheet;pencil|1;timer|1',
		steps: [
			'With an adult, choose two flower patches visible from a safe distance.',
			'Watch each patch for five minutes and tally each landing without approaching insects.',
			'Repeat later and record weather, time, and how many open flowers each patch has.'
		],
		explanation:
			'Flowers can provide nectar or pollen to visiting insects. Visitor counts depend on flower abundance, weather, time, and many other factors; a visit does not prove pollination occurred.',
		observe:
			'Compare visits per observation period and describe visibly different visitors without guessing species.',
		kind: 'observation',
		setting: 'outdoor',
		safety:
			'Keep well away from stinging insects and nests. Observe through a window if needed and never handle visitors.'
	},
	{
		id: 'bird-beak-tools',
		title: 'Try a model bird beak',
		subject: 'biology',
		concepts: ['adaptation', 'design', 'measurement'],
		question: 'Do two kitchen tools pick up the same pretend foods equally well?',
		materials:
			'large kitchen tongs|1 pair;spoon|1;crumpled paper balls|6 large;sponge strips|6 large;bowls|2;timer|1',
		steps: [
			'Put large paper balls and sponge strips in a bowl as pretend food.',
			'Use tongs for thirty seconds to move pieces into another bowl, counting each type.',
			'Reset and repeat with a spoon, then swap the order for a second round.'
		],
		explanation:
			'Bird beak shapes suit different ways of gathering food. Kitchen tools model how shape can affect a task, but real birds also use movement, experience, and other body parts.',
		observe: 'Compare numbers of each pretend food collected by each tool.',
		safety:
			'Use pieces too large to swallow, keep tools away from faces, and avoid pinching fingers.'
	},
	{
		id: 'paper-feet-mud',
		title: 'Why might a wide foot help?',
		subject: 'biology',
		concepts: ['adaptation', 'forces', 'soil'],
		question: 'Does a wider model foot sink less into a soft surface?',
		materials:
			'modeling clay|1 flattened slab;large building block|1;stiff cardboard|1 square wider than the block;ruler|1',
		steps: [
			'Press a block gently onto a smooth clay slab using its own weight for ten seconds.',
			'Smooth the clay and repeat with a wide cardboard foot placed under the same block.',
			'Compare indentation depths, repeating on freshly smoothed clay.'
		],
		explanation:
			'Spreading the same load over more area reduces average pressure. Broad feet can help some animals move over soft ground; clay is only a simplified model of that ground.',
		observe: 'Describe dent width and depth, including any trial too shallow to measure.',
		safety: 'Use non-toxic modeling clay, keep it out of mouths, and wash hands afterward.'
	},
	{
		id: 'leaf-litter-habitats',
		title: 'Compare leafy ground with bare ground',
		subject: 'biology',
		concepts: ['habitats', 'biodiversity', 'soil'],
		question: 'What differences can we observe between leaf-covered and bare ground?',
		materials: 'cardboard frame|1 with a 20-centimeter square opening;paper|1 sheet;crayons|2',
		steps: [
			'With an adult, place the frame over leaf-covered ground and observe without moving the leaves.',
			'Record visible plants, animals, shade, and surface appearance for five minutes.',
			'Repeat on nearby bare ground using the same frame and observation time.'
		],
		explanation:
			'Leaf litter can offer shelter and influence ground moisture and temperature. Visible differences suggest habitat variation, but many organisms stay hidden and a short look cannot count them all.',
		observe: 'Keep separate notes for observed organisms and guesses about hidden life.',
		kind: 'observation',
		setting: 'outdoor',
		safety:
			'Do not disturb litter or touch animals, fungi, waste, or unknown plants; wash hands afterward.'
	},
	{
		id: 'tree-bark-patterns',
		title: 'Read patterns on tree bark',
		subject: 'biology',
		concepts: ['plants', 'adaptation', 'biodiversity'],
		question: 'How do visible bark patterns differ between nearby trees?',
		materials: 'paper|3 sheets;crayons|2;cardboard viewing frame|1',
		steps: [
			'Choose three safely accessible trees with an adult and view each through the same frame.',
			'Sketch grooves, plates, colors, and smooth areas without touching or removing bark.',
			'Compare your drawings and note where on each trunk you looked.'
		],
		explanation:
			'Bark protects a tree’s living tissues. Its appearance varies with species, age, and conditions, so bark pattern alone may not identify a tree.',
		observe: 'Describe visible features using the same categories for all trees.',
		kind: 'observation',
		setting: 'outdoor',
		safety: 'Stay on safe paths, avoid insects and irritating plants, and leave bark attached.'
	},
	{
		id: 'touch-texture-sort',
		title: 'Sort textures with your fingertips',
		subject: 'biology',
		concepts: ['senses', 'materials', 'measurement'],
		question: 'Can touch help match materials when they are hidden from view?',
		materials:
			'cloth squares|2 matching;cardboard squares|2 matching;sponge squares|2 matching;paper bag|1',
		steps: [
			'Feel one sample of each material and describe its texture.',
			'An adult places the matching samples in a paper bag while you remain seated.',
			'Feel one hidden sample at a time, name your match, then look to check.'
		],
		explanation:
			'Touch receptors provide information about texture, pressure, and movement. The brain combines these signals with experience to distinguish materials.',
		observe: 'Record matches and describe which texture clues helped.',
		kind: 'observation',
		safety:
			'Use large, clean, smooth-edged samples with no sharp or irritating surfaces; never put the bag over a head.'
	},
	{
		id: 'two-eyes-depth',
		title: 'Two views help judge distance',
		subject: 'biology',
		concepts: ['senses', 'measurement', 'scale'],
		question: 'Does using one eye change a gentle tabletop pointing task?',
		materials: 'large building block|1;paper|1 sheet;crayon|1',
		steps: [
			'Place a block at a comfortable reaching distance on a table and point just above its center with both eyes open.',
			'Repeat with one eye gently closed if comfortable, stopping before touching the block.',
			'An adult shifts the block between trials; compare estimates with both eyes and one eye.'
		],
		explanation:
			'The two eyes see slightly different views that help the brain estimate depth. Size, shadows, and motion also supply depth clues, so one eye can still judge many distances.',
		observe: 'Describe differences without treating this activity as a vision test.',
		kind: 'observation',
		safety: 'Stay seated, never press on an eye, and stop if the task causes discomfort.'
	},
	{
		id: 'camouflage-patterns',
		title: 'Does a pattern help a paper animal hide?',
		subject: 'biology',
		concepts: ['adaptation', 'senses', 'habitats'],
		question: 'Can matching a background’s pattern make a paper shape harder to spot?',
		materials: 'paper|3 sheets;washable markers|2;child scissors|1 pair;timer|1',
		steps: [
			'Draw a striped background and have an adult help cut six equal paper animal shapes.',
			'Stripe three shapes to match and leave three plain, then arrange them while the searcher looks away.',
			'Give the searcher five seconds to point to shapes and repeat with a new arrangement.'
		],
		explanation:
			'Patterns can make outlines harder to distinguish against a similar background. This models one aspect of camouflage; actual concealment also depends on lighting, movement, and the observer.',
		observe: 'Count striped and plain shapes found over several trials.',
		adult: 'help',
		safety: 'Supervise scissors and collect small scraps immediately.'
	},
	{
		id: 'seed-shape-sort',
		title: 'Sort a collection of seed shapes',
		subject: 'biology',
		concepts: ['plants', 'biodiversity', 'adaptation'],
		question: 'What different outer shapes can we find among large seeds?',
		materials: 'large dry seeds|6 from known non-toxic plants;tray|1;paper|1 sheet;crayons|2',
		steps: [
			'An adult selects large familiar seeds such as beans, peas, and pumpkin seeds and puts them on a tray.',
			'Draw each seed’s outline and compare smoothness, width, and visible coverings.',
			'Sort the seeds by one visible feature, then regroup them by a different feature.'
		],
		explanation:
			'Seeds protect a young plant and contain resources for early growth. Their shapes and coverings vary, and a simple shape grouping is not the same as identifying related plants.',
		observe: 'Explain the rule for each grouping and note seeds that fit more than one group.',
		kind: 'observation',
		adult: 'help',
		safety:
			'Seeds are choking hazards and are not for eating. An adult controls the tray and counts seeds during cleanup.'
	},
	{
		id: 'soil-water-drainage',
		title: 'Which soil lets water through?',
		subject: 'earth',
		concepts: ['soil', 'water-cycle', 'materials'],
		question: 'Do equal volumes of damp sand and potting mix drain water at the same rate?',
		materials:
			'plastic funnels|2;coffee filters|2;clear cups|2;damp play sand|half a cup;damp potting mix|half a cup;water|1 cup;measuring cup|1;timer|1',
		steps: [
			'An adult supports lined funnels above cups and fills one with sand and one with potting mix.',
			'Pour half a cup of water slowly into each without overflowing.',
			'Compare water collected after one and five minutes.'
		],
		explanation:
			'Spaces between particles affect drainage and water storage. Potting mixes contain varied ingredients, so the result describes these samples rather than all soils.',
		observe: 'Record collected water and any overflow or leaks that make a trial unfair.',
		adult: 'help',
		safety:
			'An adult handles damp soil to avoid dust. Do not drink runoff; wash hands and keep solids out of drains.'
	},
	{
		id: 'soil-compaction-runoff',
		title: 'Loose ground or packed ground?',
		subject: 'earth',
		concepts: ['soil', 'water-cycle', 'erosion'],
		question: 'Does packing the same damp soil change how water soaks in?',
		materials:
			'shallow trays|2;damp potting soil|2 equal cups;water|half a cup;tablespoon|1;timer|1',
		steps: [
			'Spread equal soil amounts over equal areas in two trays, pressing one firmly and leaving the other loose.',
			'Add two tablespoons of water slowly to the center of each.',
			'Compare puddling immediately and after two minutes, then repeat on fresh samples.'
		],
		explanation:
			'Compaction changes the size and connection of pore spaces. It can slow infiltration and leave more water at the surface, though soil ingredients and starting moisture matter.',
		observe: 'Record time for surface water to disappear and any sideways flow.',
		adult: 'help',
		safety: 'Use damp soil handled by an adult, avoid dust, and wash hands after cleanup.'
	},
	{
		id: 'pebbles-slow-stream',
		title: 'Give a model stream some obstacles',
		subject: 'earth',
		concepts: ['erosion', 'water-cycle', 'forces'],
		question: 'How do large stones change the path of water on a sandy slope?',
		materials:
			'tray|1;damp play sand|2 cups;large smooth stones|3;water|half a cup;measuring cup|1',
		steps: [
			'Shape a low sand slope in a tray and pour a quarter cup of water slowly from the top.',
			'Sketch the channel, then reshape the same slope and place stones across part of the path.',
			'Pour the same water amount at a similar pace and compare the new channel.'
		],
		explanation:
			'Obstacles redirect moving water and can change where sediment is removed or deposited. Water may slow behind a stone yet cut a deeper channel around its side.',
		observe: 'Mark erosion and deposits separately on your drawings.',
		adult: 'help',
		safety: 'Use stones too large to swallow, keep sand damp, and dispose of solids outside drains.'
	},
	{
		id: 'river-delta-tray',
		title: 'Build a tiny river mouth',
		subject: 'earth',
		concepts: ['erosion', 'soil', 'water-cycle'],
		question: 'Where does sand settle when a model stream enters a still pool?',
		materials: 'tray|1;damp play sand|2 cups;water|1 cup;spoon|1;small cup|1',
		steps: [
			'Build a low sand slope at one end of a tray and a shallow water pool at the other.',
			'Make a narrow channel down the slope and pour water slowly through it.',
			'Repeat small pours and sketch where carried sand collects near the pool.'
		],
		explanation:
			'Flowing water can transport sediment. When it enters a quieter pool and slows, some sediment settles, modeling one process that can build a river delta.',
		observe: 'Watch whether deposits spread, pile up, or redirect later pours.',
		adult: 'help',
		safety: 'Keep sand damp, use a stable tray, wash hands, and keep sediment out of plumbing.'
	},
	{
		id: 'shoreline-waves',
		title: 'Waves reshape a sandy shore',
		subject: 'earth',
		concepts: ['erosion', 'soil', 'forces'],
		question: 'How does gentle wave action change a model shoreline?',
		materials: 'wide tray|1;damp play sand|2 cups;water|1 cup;plastic lid|1;paper|1 sheet',
		steps: [
			'Make a sand beach at one end of a tray and a shallow pool at the other.',
			'Draw the shoreline before moving the water.',
			'Move a plastic lid slowly back and forth in the pool to make twenty small waves, then draw again.'
		],
		explanation:
			'Waves move sediment as they wash onto and away from a shore. Some areas lose sand while others gain it; tray walls and small scale limit this model.',
		observe: 'Compare areas of sand removal and deposition.',
		adult: 'help',
		safety: 'Make gentle waves without splashing, keep sand damp, and wash hands afterward.'
	},
	{
		id: 'rock-wet-colors',
		title: 'A rock changes its look when wet',
		subject: 'earth',
		concepts: ['soil', 'light', 'materials'],
		question: 'How does wetting a rock change the colors and patterns we can see?',
		materials: 'large smooth rocks|3;water|1 small bowl;cloth|1;paper|1 sheet;crayons|3',
		steps: [
			'Sketch the colors and patterns on each clean dry rock.',
			'Wet one side of each rock and compare it with the dry side in the same light.',
			'Let the rocks dry and check whether their original appearance returns.'
		],
		explanation:
			'Water changes how light interacts with a rough rock surface, often making colors look darker or clearer. The rock has not necessarily undergone a chemical change.',
		observe: 'Compare the same patch before wetting and after drying.',
		kind: 'observation',
		safety: 'Use clean rocks too large to swallow without sharp edges; never break or taste rocks.'
	},
	{
		id: 'sediment-size-settling',
		title: 'Race two sizes of sediment',
		subject: 'earth',
		concepts: ['soil', 'mixtures', 'measurement'],
		question: 'Do coarse and fine sand settle equally quickly in water?',
		materials:
			'clear plastic cups|2;clean damp coarse sand|1 tablespoon;clean damp fine sand|1 tablespoon;water|1 cup;spoons|2;timer|1',
		steps: [
			'Put equal water in two cups and add coarse sand to one and fine sand to the other.',
			'Stir each for the same time and start timing when stirring stops.',
			'Compare cloudiness and settled layers after ten seconds, one minute, and five minutes.'
		],
		explanation:
			'For particles of similar material and shape, larger grains generally settle faster in water. Grain density and shape also influence settling, so mixed samples may not form neat layers.',
		observe: 'Record when each cup clears and note any grains that remain suspended.',
		safety:
			'An adult handles damp sand to avoid dust; do not drink the water or pour sand down drains.'
	},
	{
		id: 'air-temperature-day',
		title: 'Compare morning and afternoon air',
		subject: 'earth',
		concepts: ['weather', 'sunlight', 'measurement'],
		question: 'How does shaded outdoor air temperature change during a day?',
		materials: 'non-glass outdoor thermometer|1;paper|1 sheet;pencil|1;clock|1',
		steps: [
			'With an adult, place a weather-rated thermometer in a shaded ventilated spot away from hot walls.',
			'Read it after it settles in the morning, midday, and late afternoon.',
			'Repeat for three days, recording clouds and wind alongside each reading.'
		],
		explanation:
			'Sunlight warms surfaces that exchange heat with air. Clouds, wind, and weather systems also affect temperature, so the warmest reading is not always at midday.',
		observe: 'Compare each day’s pattern using readings from the same location.',
		kind: 'observation',
		setting: 'outdoor',
		wait: 4320,
		safety:
			'An adult places and reads the thermometer in safe weather; avoid hot surfaces and direct Sun viewing.'
	},
	{
		id: 'wind-shelter-map',
		title: 'Find a sheltered spot',
		subject: 'earth',
		concepts: ['weather', 'air', 'structures'],
		question: 'Does a wall or hedge change the motion of a short ribbon?',
		materials: 'ribbon|1 short piece;cardboard tube|1;tape|1 roll;paper|1 sheet;pencil|1',
		steps: [
			'Tape a short ribbon to a tube and observe it in a safe open spot for one minute.',
			'Move to a nearby sheltered spot at the same height and observe for one minute.',
			'Alternate between the two spots three times and record ribbon movement.'
		],
		explanation:
			'Walls and vegetation can redirect airflow and create sheltered or swirling regions. Wind also changes over time, so alternating observations helps compare the locations.',
		observe:
			'Record steady movement, fluttering, and still periods rather than guessing an exact wind speed.',
		kind: 'observation',
		setting: 'outdoor',
		safety: 'Keep ribbon short and away from necks; avoid roads, steep ground, and stormy weather.'
	},
	{
		id: 'rain-splash-patterns',
		title: 'Map the splash of a raindrop',
		subject: 'earth',
		concepts: ['weather', 'forces', 'measurement'],
		question: 'Does drop height change a water splash mark on dry paper?',
		materials: 'water|1 small cup;dropper|1;dark construction paper|3 sheets;ruler|1;tray|1',
		steps: [
			'Place dry construction paper flat in a tray.',
			'Release one drop from five centimeters, then another onto a fresh area from twenty centimeters.',
			'Compare marks immediately and repeat each height with the same dropper.'
		],
		explanation:
			'A falling drop gains speed and transfers energy on impact. Height can affect splashing, while drop size and the absorbing surface also influence the pattern.',
		observe: 'Measure the main wet mark and count any separate small splash marks.',
		safety: 'Use small water amounts on a tray and keep the dropper away from mouths.'
	},
	{
		id: 'water-cycle-covered-bowl',
		title: 'Watch droplets inside a covered bowl',
		subject: 'earth',
		concepts: ['water-cycle', 'evaporation', 'states-of-matter'],
		question: 'Can water move from a bowl to the underside of its cover without splashing?',
		materials: 'clear bowl|1;clear rigid lid|1;water|quarter cup;paper|1 sheet;pencil|1',
		steps: [
			'Put room-temperature water in a clear bowl and cover it with a dry clear lid.',
			'Place it in a mildly warm bright indoor spot away from hot direct sunlight and leave it still.',
			'Inspect the underside of the lid over two days and sketch any droplets.'
		],
		explanation:
			'Water can evaporate into the air inside the bowl and condense on a cooler cover. Visible droplets depend on temperature differences; this models only part of the water cycle.',
		observe: 'Record when droplets appear, including no-change observations.',
		wait: 2880,
		safety: 'Use plastic rather than glass, do not heat the bowl, and discard the water afterward.'
	},
	{
		id: 'mulch-water-loss',
		title: 'A leafy blanket for damp ground',
		subject: 'earth',
		concepts: ['soil', 'evaporation', 'plants'],
		question: 'Does a leaf covering change water loss from damp potting mix?',
		materials:
			'plastic containers|2 matching;damp potting mix|2 equal cups;dry fallen leaves|1 handful;kitchen scale|1',
		steps: [
			'An adult fills matching containers with equal amounts of equally damp potting mix.',
			'Cover one with clean dry leaves and weigh each complete setup separately.',
			'Leave them together indoors and reweigh after two days, comparing each loss from its own starting mass.'
		],
		explanation:
			'A mulch layer can limit airflow and exposure at the soil surface, slowing evaporation. Comparing mass changes is more useful than comparing final masses because the leaves add weight.',
		observe:
			'Record mass lost in each setup and whether the difference exceeds the scale’s resolution.',
		age: 7,
		wait: 2880,
		adult: 'help',
		safety:
			'An adult handles damp potting mix and safe leaves; avoid dust, wash hands, and clean the scale afterward.'
	},
	{
		id: 'contour-clay-island',
		title: 'Draw an island one waterline at a time',
		subject: 'earth',
		concepts: ['soil', 'scale', 'measurement'],
		question: 'What does a hill’s outline look like at different water levels?',
		materials:
			'water-resistant modeling clay|1 lump;clear shallow container|1;water|1 cup;ruler|1;paper|1 sheet;pencil|1',
		steps: [
			'Shape a small uneven clay hill in a clear container and draw its outline from above.',
			'Add water in half-centimeter depth increments and draw the shoreline after each addition.',
			'Compare the outlines and identify steep and gently sloping parts.'
		],
		explanation:
			'Each waterline traces points at the same height on the model hill. Contour maps similarly connect equal elevations; closely spaced contours indicate steeper slopes.',
		observe: 'Label each outline with its water depth and compare spacing.',
		kind: 'build',
		age: 7,
		safety: 'Use non-toxic clay, keep water shallow, and keep modeling materials out of mouths.'
	},
	{
		id: 'layered-rock-model',
		title: 'Fold a stack of model rock layers',
		subject: 'earth',
		concepts: ['soil', 'forces', 'scale'],
		question: 'How can a sideways push change stacked soft layers?',
		materials: 'non-toxic modeling dough|3 colors;tray|1;cardboard|2 stiff pieces',
		steps: [
			'Flatten three dough colors into equal rectangles and stack them on a tray.',
			'Place stiff cardboard against opposite ends and push slowly inward.',
			'Observe the side of the stack and draw how the layers bend or thicken.'
		],
		explanation:
			'Rock layers can fold under compression over long times and suitable conditions. Soft dough shows possible shapes but does not reproduce the pressures, temperatures, or timescales of real rocks.',
		observe: 'Track one colored layer from end to end through the folded stack.',
		kind: 'build',
		safety:
			'Use dough appropriate for allergies, never taste it, and press slowly without pinching fingers.'
	},
	{
		id: 'permeable-ground-model',
		title: 'Where does rain go on a paved surface?',
		subject: 'earth',
		concepts: ['water-cycle', 'materials', 'design'],
		question: 'How do a sponge and a plastic lid handle equal simulated rainfall?',
		materials: 'sponge|1 large;plastic lid|1 similar area;trays|2;water|4 tablespoons;tablespoon|1',
		steps: [
			'Place a dry sponge and a plastic lid in separate trays on level ground.',
			'Pour two tablespoons of water slowly over each surface.',
			'Compare water held in or on the surfaces and water reaching the trays.'
		],
		explanation:
			'Permeable surfaces allow water into connected spaces, while impermeable surfaces do not. The sponge models storage rather than reproducing every feature of real soil or pavement.',
		observe: 'Record absorption, puddling, and runoff as different outcomes.',
		safety: 'Use a clean sponge, keep trays away from electricity, and dry spills.'
	},
	{
		id: 'slope-runoff-speed',
		title: 'Water takes a steeper path',
		subject: 'earth',
		concepts: ['water-cycle', 'gravity', 'erosion'],
		question: 'Does a steeper smooth slope change how quickly water reaches the bottom?',
		materials: 'plastic tray|1;books|2;water|4 tablespoons;tablespoon|1;timer|1;basin|1',
		steps: [
			'Support one end of a plastic tray on one book, with the lower end inside a basin.',
			'Pour one tablespoon of water from a marked starting point and time its arrival at the bottom.',
			'Dry the tray, raise it on two books, and repeat several times at each height.'
		],
		explanation:
			'Gravity pulls water downhill, and a steeper slope increases the downhill component of that pull. Surface wetness and pour shape can change travel time too.',
		observe: 'Compare travel times and record any trial too quick to time accurately.',
		adult: 'help',
		safety: 'Keep supports low and stable, protect books from water, and dry the floor immediately.'
	},
	{
		id: 'earth-moon-spacing',
		title: 'Give the Moon enough space',
		subject: 'space',
		concepts: ['moon', 'scale', 'measurement'],
		question: 'How far apart should a model Earth and Moon be at the same scale?',
		materials: 'paper|2 sheets;ruler|1;measuring tape|1;crayons|2;child scissors|1 pair',
		steps: [
			'Draw an Earth circle four centimeters across and a Moon circle about one centimeter across.',
			'An adult helps cut out the circles; predict how far apart their centers should be.',
			'Place their centers about 120 centimeters apart and compare the model with your prediction.'
		],
		explanation:
			'The average Earth–Moon distance is about thirty Earth diameters. This rounded model shows both sizes and separation approximately; the real distance varies along the Moon’s orbit.',
		observe: 'Record your predicted spacing and the model spacing using the same units.',
		kind: 'build',
		age: 7,
		adult: 'help',
		safety: 'Supervise scissors and clear the model from the floor after measuring.',
		sources: [
			{
				title: 'NASA Space Place: How Far Away Is the Moon?',
				url: 'https://spaceplace.nasa.gov/moon-distance/en/'
			}
		]
	},
	{
		id: 'sun-earth-width',
		title: 'Fit Earths across a paper Sun',
		subject: 'space',
		concepts: ['sunlight', 'scale', 'measurement'],
		question: 'How does Earth’s width compare with the Sun’s width?',
		materials: 'paper strip|1 at least 109 centimeters long;ruler|1;crayons|2',
		steps: [
			'Draw a one-centimeter circle to represent Earth.',
			'Mark a line 109 centimeters long on a paper strip to represent the Sun’s diameter at the same scale.',
			'Mark every ten centimeters and compare the tiny Earth circle with the full line.'
		],
		explanation:
			'The Sun’s diameter is about 109 times Earth’s diameter. This compares widths, not volumes, and the strip does not show the enormous distance between Earth and the Sun.',
		observe: 'Explain why 109 Earth widths across is different from 109 Earths filling a sphere.',
		kind: 'build',
		age: 7,
		safety: 'Make this indoor paper model without looking at the real Sun.',
		sources: [
			{
				title: 'NASA: Sun Fact Sheet',
				url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/sunfact.html'
			}
		]
	},
	{
		id: 'eclipse-shadow-model',
		title: 'Line up a model eclipse',
		subject: 'space',
		concepts: ['moon', 'light', 'orbits'],
		question: 'What alignment lets a small model Moon cast a shadow on a model Earth?',
		materials: 'flashlight|1;large ball|1;small paper ball|1;tape|1 roll;cardboard tube|1',
		steps: [
			'Rest a large ball securely on a table as Earth and aim a flashlight toward it.',
			'An adult tapes a small paper ball atop a tube and moves it between the light and Earth.',
			'Move the paper Moon slightly above and below the line and watch whether its shadow still reaches Earth.'
		],
		explanation:
			'A solar eclipse happens when the Moon passes between the Sun and Earth and its shadow reaches Earth. The Moon’s tilted orbit means this alignment does not happen at every new Moon.',
		observe: 'Sketch an alignment that makes a shadow and one that misses.',
		kind: 'build',
		adult: 'help',
		safety:
			'Use only a flashlight indoors, aim away from eyes, and never try this by viewing the Sun.'
	},
	{
		id: 'lunar-eclipse-model',
		title: 'Move a Moon into Earth’s shadow',
		subject: 'space',
		concepts: ['moon', 'light', 'orbits'],
		question: 'Where must a model Moon move to enter a model Earth’s shadow?',
		materials: 'flashlight|1;large ball|1;small paper ball|1;cardboard tube|1;tape|1 roll',
		steps: [
			'Shine a flashlight toward a large ball in a dim room.',
			'An adult moves a small paper ball on a tube behind the large ball, on the side away from the light.',
			'Move the small ball sideways and compare its brightness inside and outside the shadow.'
		],
		explanation:
			'A lunar eclipse occurs when the Moon passes into Earth’s shadow. This differs from ordinary Moon phases, which come from seeing different portions of the Moon’s sunlit half.',
		observe: 'Draw the order of light, Earth, and Moon during the modeled eclipse.',
		kind: 'build',
		adult: 'help',
		safety: 'Keep flashlight beams away from eyes and maintain enough room light to move safely.'
	},
	{
		id: 'moon-same-face',
		title: 'Keep one Moon face toward Earth',
		subject: 'space',
		concepts: ['moon', 'rotation', 'orbits'],
		question: 'Must a model Moon turn to keep the same side facing Earth?',
		materials: 'large ball|1;small ball|1;removable stickers|2;paper|1 sheet',
		steps: [
			'Put a large Earth ball at the center of a table and a face sticker on the small Moon ball.',
			'Move the Moon in a circle while keeping its face pointed toward Earth.',
			'Track a second sticker on the opposite side relative to the room and compare its direction at four positions.'
		],
		explanation:
			'Keeping the same face toward Earth requires the Moon to rotate once during each orbit. The real Moon’s rotation and orbital periods match closely, so we see mostly the same hemisphere.',
		observe:
			'Describe how the face changes direction relative to the room while still facing Earth.',
		kind: 'build',
		age: 7,
		safety: 'Use large balls that cannot be swallowed and move models slowly on a clear table.'
	},
	{
		id: 'tilted-earth-light',
		title: 'Tilt a model Earth toward the light',
		subject: 'space',
		concepts: ['sunlight', 'rotation', 'scale'],
		question: 'How does a fixed tilt change which hemisphere leans toward a model Sun?',
		materials: 'large ball|1;flashlight|1;removable stickers|3',
		steps: [
			'Mark north, south, and an equator point on a ball with stickers.',
			'An adult keeps a flashlight at a fixed location while you tilt the ball’s north end toward one wall.',
			'Move the ball to opposite sides of the light, keeping north tilted toward that same wall. The adult aims at the ball from the fixed location; compare which hemisphere leans toward the light.'
		],
		explanation:
			'Earth’s axis stays pointed nearly the same way as Earth orbits the Sun. Its tilt changes sunlight angle and day length during the year, contributing to seasons in opposite hemispheres.',
		observe:
			'Draw the two positions with matching tilt directions and label the hemisphere leaning toward the light.',
		kind: 'build',
		age: 7,
		adult: 'help',
		safety: 'Aim the flashlight at the model and away from faces; keep the walking space clear.'
	},
	{
		id: 'sunlight-angle-patch',
		title: 'Spread a beam over more ground',
		subject: 'space',
		concepts: ['sunlight', 'light', 'scale'],
		question: 'How does tilting a surface change the area covered by a light beam?',
		materials: 'flashlight|1;graph paper|2 sheets;cardboard|1 piece;tape|1 roll;pencil|1',
		steps: [
			'Tape graph paper to cardboard and shine a flashlight straight toward its center.',
			'Outline the bright patch, then tilt the board while keeping its center the same distance from the flashlight.',
			'Outline the new patch and estimate the grid squares inside each outline.'
		],
		explanation:
			'A beam striking at a shallow angle spreads over more surface area. This helps explain why sunlight angle matters for heating, though a flashlight outline alone does not measure temperature.',
		observe: 'Compare patch shape and area at the two angles.',
		age: 7,
		safety: 'Use flashlight light only and keep the beam away from eyes.'
	},
	{
		id: 'star-parallax-thumb',
		title: 'A nearby thumb seems to jump',
		subject: 'space',
		concepts: ['scale', 'senses', 'measurement'],
		question: 'Does a nearby object shift more than a distant one when the viewpoint changes?',
		materials: 'paper|1 sheet;marker|1;chair|1',
		steps: [
			'Draw a large cross on paper across the room and sit facing it.',
			'Hold your thumb comfortably in front of the cross and alternately close each eye without moving your head.',
			'Repeat with your thumb farther from your face and compare its apparent sideways jump.'
		],
		explanation:
			'An object’s apparent position shifts against a distant background when the viewpoint changes. This is parallax; astronomers use observations from different positions in Earth’s orbit to help measure nearby star distances.',
		observe: 'Describe which thumb position produces the larger apparent shift.',
		kind: 'observation',
		safety:
			'Stay seated, do not press on your eyes, and stop if closing an eye feels uncomfortable.'
	},
	{
		id: 'apparent-disk-size',
		title: 'A small circle can cover a big one',
		subject: 'space',
		concepts: ['scale', 'light', 'measurement'],
		question: 'Can a nearby small paper disk hide a larger distant disk?',
		materials: 'paper|2 sheets;crayons|2;child scissors|1 pair;ruler|1',
		steps: [
			'An adult helps cut circles four and eight centimeters across.',
			'Place the large circle upright and hold the small circle closer to one comfortable viewing position.',
			'Move the small circle until it just covers the large one and compare distances.'
		],
		explanation:
			'Apparent size depends on both actual size and distance. Objects of different sizes can cover the same part of our view; this idea helps explain how the Moon can cover the Sun during an eclipse.',
		observe: 'Compare the distance ratio with the circles’ diameter ratio.',
		age: 7,
		adult: 'help',
		safety:
			'Use paper disks indoors, supervise scissors, and never compare disks against the real Sun.'
	},
	{
		id: 'planet-transit-model',
		title: 'A planet crosses a paper star',
		subject: 'space',
		concepts: ['orbits', 'light', 'scale'],
		question: 'How does a model planet’s size affect how much of a paper star it covers?',
		materials: 'white paper|1 sheet;dark paper|1 sheet;child scissors|1 pair;crayon|1',
		steps: [
			'Draw a large star disk and have an adult help cut two smaller dark planet disks of different sizes.',
			'Slide each planet across the center of the star disk.',
			'Compare how much white area is hidden at the middle and at the edge.'
		],
		explanation:
			'A planet passing in front of its star can block a small fraction of the star’s light, called a transit. This area model shows why relative size matters, but does not measure actual starlight.',
		observe: 'Sketch the covered area for both planet sizes.',
		kind: 'build',
		adult: 'help',
		safety: 'Supervise scissors, collect scraps, and use paper only without observing the Sun.'
	},
	{
		id: 'crater-overlap-history',
		title: 'Which crater came first?',
		subject: 'space',
		concepts: ['soil', 'forces', 'scale'],
		question: 'Can overlapping model craters reveal their order of formation?',
		materials: 'damp play sand|1 tray;large balls|2 different sizes;paper|1 sheet;pencil|1',
		steps: [
			'Smooth damp sand and gently press a large ball into it to make a round crater model.',
			'Make a second dent that crosses the first dent’s rim without smoothing the sand.',
			'Draw the overlapping rims and ask someone who did not watch which dent came later.'
		],
		explanation:
			'A newer impact crater can interrupt or cover parts of an older crater. Overlapping features help establish relative age, although this pressing model does not reproduce a real high-speed impact.',
		observe: 'Identify which rim remains continuous where the dents meet.',
		kind: 'build',
		safety: 'Use balls too large to swallow, keep sand damp, and wash hands after cleanup.'
	},
	{
		id: 'moon-low-sun-shadows',
		title: 'Reveal craters with sideways light',
		subject: 'space',
		concepts: ['moon', 'light', 'soil'],
		question: 'Does light angle change how clearly we see dents in a model Moon?',
		materials:
			'non-toxic modeling clay|1 flattened slab;large ball|1;flashlight|1;paper|1 sheet;pencil|1',
		steps: [
			'Press a ball into clay to make several shallow dents.',
			'Shine a flashlight from almost overhead and sketch the visible shadows.',
			'Move the light low to one side without changing the clay and compare the same dents.'
		],
		explanation:
			'Low-angle illumination makes longer shadows behind raised features and crater rims. Shadows help reveal lunar terrain, so the same feature looks different as the Sun’s direction changes.',
		observe: 'Compare shadow length and which shallow features become easier to see.',
		safety: 'Keep clay out of mouths and aim the flashlight away from eyes.'
	},
	{
		id: 'orbit-path-length',
		title: 'A bigger orbit has a longer road',
		subject: 'space',
		concepts: ['orbits', 'scale', 'measurement'],
		question: 'How does circle size change the length of a model orbital path?',
		materials:
			'paper|1 large sheet;round lids|2 different sizes;crayon|1;string|1 short length;ruler|1',
		steps: [
			'Trace two different-sized circles and mark their centers.',
			'An adult helps lay string along each outline, then straighten it to measure the path length.',
			'Compare both paths and discuss what would happen if a model traveler moved at the same speed on each.'
		],
		explanation:
			'A larger circular path is longer. At the same speed it takes longer to complete, but real planets also have different orbital speeds, so path length alone cannot explain their years.',
		observe: 'Record circle widths and path lengths in the same units.',
		kind: 'build',
		age: 7,
		adult: 'help',
		safety: 'Keep string short and away from necks; use smooth plastic lids.'
	},
	{
		id: 'space-message-delay',
		title: 'Send a rover a delayed message',
		subject: 'space',
		concepts: ['light', 'scale', 'design'],
		question: 'How does a message delay change a pretend rover’s response time?',
		materials: 'paper command cards|6;timer|1;toy vehicle|1;paper|1 large sheet',
		steps: [
			'Draw a short safe route on paper and write commands such as move one square or turn left.',
			'One person sends a card and a second person waits five seconds before moving the rover, then waits five seconds to report back.',
			'Repeat with immediate messages and compare how long it takes to complete the route.'
		],
		explanation:
			'Radio messages travel at the speed of light, which is fast but finite. Spacecraft far from Earth receive delayed commands; this invented five-second delay models the idea rather than a particular mission.',
		observe: 'Compare elapsed time and discuss why planning several steps can help.',
		kind: 'build',
		age: 7,
		safety: 'Use a large toy on a tabletop and keep the route away from edges.'
	},
	{
		id: 'pixel-planet-map',
		title: 'See a planet through a coarse grid',
		subject: 'space',
		concepts: ['light', 'scale', 'measurement', 'design'],
		question: 'How does the size of a drawing grid affect visible surface detail?',
		materials: 'graph paper|2 sheets with different grid sizes;crayons|3;paper|1 sheet',
		steps: [
			'Draw an imaginary planet with a large land patch, a narrow river, and a small island.',
			'Copy the planet onto a coarse grid, filling each square with just its main color.',
			'Repeat on a finer grid using the same overall planet width and compare retained details.'
		],
		explanation:
			'An image with more samples across an object can represent finer detail. Space images also depend on optics, distance, lighting, and noise, so more pixels alone do not guarantee a sharper view.',
		observe: 'List which features disappear or change shape on the coarse grid.',
		kind: 'build',
		age: 7,
		safety: 'Use washable drawing supplies and take a break if close work becomes tiring.'
	},
	{
		id: 'star-pattern-frame',
		title: 'Choose the edges of a star picture',
		subject: 'space',
		concepts: ['light', 'scale', 'senses', 'measurement'],
		question: 'Does changing a viewing frame change the star pattern we notice?',
		materials: 'paper|1 large sheet;crayons|2;cardboard frames|2 different opening sizes',
		steps: [
			'Draw twenty scattered dots on paper as imaginary stars.',
			'Place a small cardboard frame over part of the field and sketch a pattern among the visible dots.',
			'Center a larger frame at the same spot and compare the pattern with the additional dots.'
		],
		explanation:
			'A field of view determines which objects appear together in a picture. People recognize patterns in apparent star positions, but a familiar pattern is not evidence that its stars are physically connected.',
		observe: 'Mark dots shared by both views and dots visible only in the wider frame.',
		kind: 'observation',
		safety:
			'An adult prepares smooth-edged frames; use this paper model without looking toward the Sun.'
	},
	{
		id: 'paper-column-shapes',
		title: 'Which paper column holds a roof?',
		subject: 'engineering',
		concepts: ['structures', 'forces', 'materials', 'design'],
		question: 'How does a paper column’s cross-section affect its ability to support a light load?',
		materials:
			'paper|3 matching sheets;tape|1 roll;cardboard|1 small square;large lightweight blocks|6',
		steps: [
			'Make equal-height paper columns with round, square, and triangular cross-sections using the same amount of paper.',
			'Stand each on the floor and rest the same cardboard roof on top.',
			'Add lightweight blocks one at a time, stopping at the first buckle, and compare.'
		],
		explanation:
			'Column shape affects how a thin material resists buckling. Fold quality, seams, and load position also matter, so repeated builds may give different capacities.',
		observe: 'Record supported load and where each column first bends.',
		kind: 'build',
		safety:
			'Build below knee height with lightweight blocks too large to swallow and keep hands clear of falling loads.'
	},
	{
		id: 'triangle-frame-brace',
		title: 'Stop a square from wobbling',
		subject: 'engineering',
		concepts: ['structures', 'forces', 'design'],
		question: 'Does a diagonal brace help a square frame keep its shape?',
		materials: 'cardboard strips|4 equal plus 1 longer diagonal;tape|1 roll;paper|1 sheet;pencil|1',
		steps: [
			'Tape four strips into a square using flexible tape hinges at the corners.',
			'Push gently sideways and trace how the frame changes shape.',
			'Tape the fifth strip diagonally across the frame and repeat the gentle push.'
		],
		explanation:
			'A hinged square can shear into a slanted shape without changing side lengths. A diagonal brace forms triangles and limits that motion, making the frame more rigid.',
		observe: 'Compare corner movement before and after adding the brace.',
		kind: 'build',
		safety: 'Use smooth-edged strips and press gently rather than snapping the frame.'
	},
	{
		id: 'bridge-span-length',
		title: 'How far can a paper bridge reach?',
		subject: 'engineering',
		concepts: ['structures', 'forces', 'measurement', 'design'],
		question: 'Does increasing support spacing change how much a paper bridge bends?',
		materials: 'cardstock|1 strip;books|2 short equal stacks;large lightweight block|1;ruler|1',
		steps: [
			'Set two low book stacks ten centimeters apart and span them with cardstock.',
			'Place a light block at the center and estimate how far the bridge sags.',
			'Remove the load, move supports fifteen centimeters apart, and repeat with undamaged cardstock.'
		],
		explanation:
			'A longer unsupported span generally bends more under the same central load. Engineers consider span, shape, material, and load together when designing bridges.',
		observe: 'Record sag and stop if a lasting crease forms.',
		kind: 'build',
		safety: 'Use low supports on the floor, light loads, and no body weight on the model.'
	},
	{
		id: 'arch-block-model',
		title: 'Build an arch with folded paper',
		subject: 'engineering',
		concepts: ['structures', 'forces', 'design'],
		question: 'Can side supports help a curved paper arch hold a light roof?',
		materials:
			'cardstock|1 strip;large blocks|2;cardboard|1 small square;paper towel|1 crumpled sheet',
		steps: [
			'Curve a cardstock strip into an arch on the floor and place a small cardboard roof on it.',
			'Add a crumpled paper towel load and watch whether the arch feet spread.',
			'Place blocks against the outside of both feet and repeat with the same curve and load.'
		],
		explanation:
			'An arch transfers load toward its supports and can push them outward. Holding the feet in place can help it keep its shape, though flexible paper also bends.',
		observe: 'Compare spreading and roof height with and without side supports.',
		kind: 'build',
		safety: 'Keep loads light and supports on the floor away from toes.'
	},
	{
		id: 'paper-beam-depth',
		title: 'Turn a beam on its edge',
		subject: 'engineering',
		concepts: ['structures', 'materials', 'forces'],
		question: 'Does a cardboard strip resist bending differently when it stands on edge?',
		materials:
			'stiff cardboard strip|1;books|2 short stacks;modeling clay|2 lumps;large lightweight block|1',
		steps: [
			'Span a small gap between book stacks with a cardboard strip lying flat and add a light block at its center.',
			'Remove the load and turn the strip onto its long edge.',
			'Use clay at the ends to prevent sideways tipping and repeat with the same gap and load.'
		],
		explanation:
			'A beam’s depth in the bending direction strongly affects its stiffness. Turning the strip on edge changes its cross-section relative to the load without changing its material.',
		observe: 'Compare bending and note that sideways tipping is different from downward bending.',
		kind: 'build',
		age: 7,
		adult: 'help',
		safety: 'Use smooth cardboard, low supports, and a lightweight load; keep clay out of mouths.'
	},
	{
		id: 'tower-top-weight',
		title: 'Move a tower’s weight down low',
		subject: 'engineering',
		concepts: ['balance', 'gravity', 'structures', 'design'],
		question: 'Does the position of the same extra weight change a tower’s stability?',
		materials:
			'small cardboard box|1 tall;modeling clay|1 lump;tape|1 roll;cardboard|1 sheet;ruler|1',
		steps: [
			'Tape clay inside the top of a lightweight upright box and stand it on a cardboard sheet.',
			'An adult slowly raises one edge of the sheet and measures its height when the box begins to tip.',
			'Move the clay inside the bottom, keeping the box orientation unchanged, and repeat.'
		],
		explanation:
			'Moving mass lower lowers the center of mass. A lower center of mass often allows a greater tilt before its weight acts beyond the base and the object topples.',
		observe: 'Compare edge-lift heights for the two weight positions.',
		kind: 'build',
		adult: 'help',
		safety: 'Use a small light box on the floor and keep hands out of the falling path.'
	},
	{
		id: 'ramp-switchback',
		title: 'Take the longer ramp route',
		subject: 'engineering',
		concepts: ['forces', 'gravity', 'design'],
		question: 'How does ramp length change the effort of slowly moving a load to the same height?',
		materials:
			'cardboard ramps|2 sturdy different lengths;book|1;small toy vehicle|1;paper|1 sheet',
		steps: [
			'Rest the ends of a short and a long ramp on the same low book.',
			'Push the same toy vehicle slowly up each ramp, trying to keep its speed steady.',
			'Repeat in alternating order and compare effort with travel distance.'
		],
		explanation:
			'A gentler ramp spreads a height gain over more distance and can reduce the required uphill force. Friction still matters, and hand sensation is not an exact force measurement.',
		observe: 'Describe both effort and travel distance instead of calling one route less work.',
		kind: 'build',
		safety: 'Keep ramps low on a clear floor and never ride or stand on them.'
	},
	{
		id: 'wheel-size-obstacles',
		title: 'Roll a large wheel over a bump',
		subject: 'engineering',
		concepts: ['forces', 'structures', 'design'],
		question: 'Do different-sized round lids cross the same small bump equally easily?',
		materials: 'plastic lids|2 different diameters;cardboard|1 small strip;tape|1 roll;tray|1',
		steps: [
			'Tape a small folded cardboard bump across a tray.',
			'Roll each lid upright toward the bump from the same starting line with a gentle push.',
			'Repeat several times, comparing stops, tipping, and successful crossings.'
		],
		explanation:
			'Wheel radius changes the geometry of meeting an obstacle. Larger wheels can cross some bumps more easily, but lid mass, grip, and the push also affect this informal comparison.',
		observe: 'Record successes and note lid differences beyond diameter.',
		kind: 'build',
		safety: 'Use large smooth lids, roll only on a tray, and keep them away from mouths.'
	},
	{
		id: 'paper-track-rails',
		title: 'Keep a rolling ball on its road',
		subject: 'engineering',
		concepts: ['forces', 'structures', 'design'],
		question: 'Can side rails help a ball stay on a slightly curved track?',
		materials: 'cardstock|2 long strips;tape|1 roll;book|1;large ball|1',
		steps: [
			'Make a wide low cardstock ramp with a gentle bend near the bottom.',
			'Release a ball from a marked line and count how often it leaves the track in five trials.',
			'Fold and tape side rails onto the same track, then repeat from the same line.'
		],
		explanation:
			'A moving ball tends to continue along its current direction. Rails can push it sideways to follow a curve, though a steep ramp or low rail may still let it escape.',
		observe: 'Compare successful runs and where the ball contacts the rails.',
		kind: 'build',
		safety: 'Use a ball too large to swallow and a low track on a clear floor.'
	},
	{
		id: 'package-cushion',
		title: 'Design a soft landing for a clay parcel',
		subject: 'engineering',
		concepts: ['forces', 'materials', 'design'],
		question: 'Does paper cushioning reduce flattening of a clay ball in a short drop?',
		materials:
			'small cardboard boxes|2 matching;modeling clay|2 equal balls;paper towel|3 sheets;ruler|1;tray|1',
		steps: [
			'Place a clay ball at the bottom of one box and nest the other in loose paper towel in the second box.',
			'An adult drops each closed box from twenty centimeters above a tray.',
			'Compare clay flattening, then reshape equal balls and repeat with the same drop height.'
		],
		explanation:
			'Cushioning can extend the stopping time and distance, reducing the peak force on a parcel. The clay’s change in shape is only a rough sign of the impact it experienced.',
		observe: 'Measure clay width before and after each drop.',
		kind: 'build',
		adult: 'help',
		safety:
			'Use lightweight boxes and short drops away from feet; never use breakable or living cargo.'
	},
	{
		id: 'roof-slope-drainage',
		title: 'Help a roof shed its rain',
		subject: 'engineering',
		concepts: ['water-cycle', 'gravity', 'design'],
		question: 'Does changing roof slope change how much water remains on top?',
		materials: 'plastic lid|1 flat;books|2 thin;water|4 tablespoons;tablespoon|1;tray|1',
		steps: [
			'Set a plastic lid flat in a tray and pour one tablespoon of water onto its center.',
			'After ten seconds, observe pooled water and dry the lid.',
			'Prop one edge at two different low heights and repeat with equal pours.'
		],
		explanation:
			'A slope gives water a downhill path. Surface texture, rims, and seams can still trap water, so roof drainage depends on more than waterproof material.',
		observe: 'Compare puddles and where runoff leaves the lid.',
		kind: 'build',
		safety: 'Keep supports stable, protect books from water, and wipe spills.'
	},
	{
		id: 'gutter-gap',
		title: 'Join two tiny rain gutters',
		subject: 'engineering',
		concepts: ['water-cycle', 'materials', 'design'],
		question: 'Does overlapping a gutter joint reduce leaks?',
		materials:
			'aluminum foil|2 equal rectangles;books|1 thin;water|4 tablespoons;tablespoon|1;tray|1;paper towel|2 squares',
		steps: [
			'Fold foil into two short channels and slope them gently in a tray with their ends just touching.',
			'Put dry paper towel beneath the joint and pour one tablespoon of water down the upper channel.',
			'Replace the towel and overlap the upper channel inside the lower one, then repeat the pour.'
		],
		explanation:
			'A joint can leak even when its material blocks water. Overlapping pieces in the direction of flow can guide water across the seam into the next channel.',
		observe: 'Compare wetness below the joint and water reaching the end.',
		kind: 'build',
		safety: 'Fold foil edges inward, use small pours, and dry the work area.'
	},
	{
		id: 'tape-joint-area',
		title: 'Give a paper joint more grip',
		subject: 'engineering',
		concepts: ['materials', 'forces', 'design'],
		question: 'Does a larger tape overlap help two paper strips stay joined under a light pull?',
		materials:
			'paper strips|4 matching;tape|1 roll;small paper cup|1;crumpled paper balls|6;tray|1',
		steps: [
			'Join two strips end to end with a short tape patch and another pair with a longer patch of the same tape.',
			'An adult holds one joined strip just above a tray while a light paper cup is taped to the lower end.',
			'Add paper balls one at a time, then repeat with the other joint using the same cup and loads.'
		],
		explanation:
			'Tape transfers force through its adhesive contact area. More overlap can help, but peeling direction, paper tearing, and how firmly the tape is pressed also affect failure.',
		observe:
			'Record supported loads or report that neither joint failed within the available load.',
		kind: 'build',
		adult: 'help',
		safety: 'Use paper loads only, hold close to the tray, and keep tape away from skin and hair.'
	},
	{
		id: 'folded-fan-design',
		title: 'Which hand fan moves more air?',
		subject: 'engineering',
		concepts: ['air', 'materials', 'design'],
		question: 'Do flat and accordion-folded paper fans move a hanging strip equally?',
		materials: 'paper|3 matching sheets;tape|1 roll;ruler|1;cardboard box|1',
		steps: [
			'Tape a short narrow paper strip to the top edge of a box so it hangs freely.',
			'Make five gentle strokes with a flat paper fan from a marked distance.',
			'Fold a matching sheet into an accordion fan and repeat, keeping stroke size and pace similar.'
		],
		explanation:
			'Folds can stiffen paper and change the shape presented to air. Both stiffness and exposed area affect airflow, so this compares complete fan designs rather than a single isolated property.',
		observe: 'Compare strip deflection and whether each fan bends during a stroke.',
		kind: 'build',
		safety: 'Fan away from faces and use a short paper indicator without strings.'
	},
	{
		id: 'cloth-water-carrier',
		title: 'Carry water without a cup',
		subject: 'engineering',
		concepts: ['capillary-action', 'materials', 'design'],
		question: 'Does folding a cloth change how much water it carries between bowls?',
		materials: 'cloth squares|2 matching;water|half a cup;bowls|2;tablespoon|1;tray|1',
		steps: [
			'Place a water bowl and an empty bowl in a tray, a hand-width apart.',
			'Dip a flat cloth fully for five seconds, lift for three seconds, then move and squeeze it into the empty bowl.',
			'Measure the collected water and repeat with an equally dry matching cloth folded into quarters.'
		],
		explanation:
			'Fibers and spaces within a cloth hold water. Folding changes drainage paths and handling, which can affect delivery even when the amount of material stays the same.',
		observe: 'Compare delivered water and drips left in the tray over repeated trials.',
		kind: 'build',
		safety: 'Use clean cloths, move only over the tray, and dry spills immediately.'
	},
	{
		id: 'cardboard-cantilever',
		title: 'How far can a shelf stick out?',
		subject: 'engineering',
		concepts: ['structures', 'balance', 'design'],
		question: 'Does a longer unsupported overhang bend more under the same light load?',
		materials: 'stiff cardboard strip|1;books|2;large lightweight block|1;ruler|1',
		steps: [
			'On the floor, sandwich most of a cardboard strip between two books with five centimeters extending beyond them.',
			'Place a light block near the free tip and measure how far the tip bends.',
			'Remove the load, extend the strip to ten centimeters, and repeat while keeping it firmly supported.'
		],
		explanation:
			'A cantilever is supported at one end. A longer overhang increases the turning effect of a load at its tip and usually causes more bending in the same material.',
		observe: 'Compare tip bending and stop if the cardboard creases or the support shifts.',
		kind: 'build',
		adult: 'help',
		safety:
			'Use a low setup on the floor and lightweight loads; an adult checks that the books cannot tip.'
	}
];

export const starterCatalog: CatalogRecord[] = validateCatalog(
	entries.map((entry) => ({
		activity: {
			id: entry.id,
			title: entry.title,
			question: entry.question,
			summary: entry.observe,
			subject: entry.subject,
			concepts: entry.concepts,
			kind: entry.kind ?? 'experiment',
			ageMin: entry.age ?? 5,
			ageMax: 10,
			setting: entry.setting ?? 'indoor',
			activeMinutes: entry.minutes ?? 20,
			waitMinutes: entry.wait ?? 0,
			adult: entry.adult ?? 'nearby',
			materials: entry.materials.split(';').map((material) => {
				const [name, quantity] = material.split('|');
				return { name, quantity };
			}),
			steps: entry.steps,
			prediction:
				entry.question + ' Ask your child to make a prediction and explain why before beginning.',
			observe: entry.observe,
			explanation: entry.explanation,
			fairTest:
				entry.fairTest ??
				(entry.kind === 'observation'
					? 'Record only what you observe, including dates and conditions. Compare observations without assuming one observation proves a cause.'
					: 'Change one feature at a time, keep the other materials and conditions as similar as possible, and repeat the comparison three times when practical.'),
			safety: [
				entry.safety ??
					'Work with an adult nearby. Keep materials out of mouths and tidy the work area afterward.'
			],
			younger:
				'Let your child predict, watch, point, and draw. An adult sets up the materials and helps describe what changes.',
			older:
				'Let your child help plan the comparison, record results in a table, and explain what the evidence does and does not show.',
			sources: entry.sources ?? []
		},
		status: 'starter',
		provenance: {
			origin: 'starter',
			model: null,
			responseId: null,
			createdAt: '2026-10-18T00:00:00.000Z',
			promptVersion: 'starter-v1'
		},
		review: null
	}))
);
