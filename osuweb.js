var osuweb = {
	version: "2017.05.29.0000",
	versionType: "alpha",
};

osuweb.game = {
	// 0 - Main Menu
	// 1 - Song Select
	// 2 - In Game
	// 20 - Paused
	state: 0,
	database: {
		// The place where the database will be stored locally
		databaseFile: "",
		songDirectory: "",
		skinDirectory: "",
		mapsets: {},
		collections: {}
	}
}

osuweb.audio = {
	songBuffer: null,
	songSource: null,
	hitsound: {
		normal: {
			hit: null,
			clap: null,
			whistle: null,
			finish: null
		},
		drum: {
			hit: null,
			clap: null,
			whistle: null,
			finish: null
		},
		soft: {
			hit: null,
			clap: null,
			whistle: null,
			finish: null
		}
	}
}

osuweb.file = {
	
}

osuweb.graphics = {
	
}

osuweb.mathutil = {
	bezierCurve: function(pointArray, accuracy) {
		let bx1 = p[0].x;
		let by1 = p[0].y;
		let bx2;
		let by2;

		steps = 1 / steps;

		for(float i = 0; i < 1; i += steps)
		{
			bx2 = by2 = 0;
			for(let j = 0; j < nbPoint; j++)
			{
				bx2 += (int)(binomialCoef(nbPoint, j) * pow(1 - i, (float)nbPoint - j) * pow(i, j) * p[j].x);
				by2 += (int)(binomialCoef(nbPoint, j) * pow(1 - i, (float)nbPoint - j) * pow(i, j) * p[j].y);
			}

			bresenhamLine(obj, bx1, by1, bx2, by2, red, green, blue);

			bx1 = bx2;
			by1 = by2;
		}

		// curve must end on the last anchor point
		bresenhamLine(obj, bx1, by1, p[nbPoint - 1].x, p[nbPoint - 1].y, red, green, blue);
	},
	binomialCoef: function(n, k)
	{
		unsigned int r = 1;

		if(k > n)
			return 0;

		for(unsigned int d = 1; d <= k; d++)
		{
			r *= n--;
			r /= d;
		}

		return r;
	}
}

osuweb.graphics.scene = {
	sceneSwitching: false,
	scenes: {
		sceneMainMenu
	}
}

skin = {
	name: "Default",
	// static definition of string literals
	soundFileName: {
		// welcome screen
		welcome: "welcome",
		seeya: "seeya",
		heartbeat: "heartbeat",
		
		// chat
		keyconfirm: "key-confirm",
		keydelete: "key-delete",
		keymovement: "key-movement",
		keypress1: "key-press-1",
		keypress2: "key-press-2",
		keypress3: "key-press-3",
		keypress4: "key-press-4",
		
		// click sounds
		backbuttonclick: "back-button-click",
		checkon: "check-on",
		checkoff: "check-off",
		clickclose: "click-close",
		clickshortconfirm: "click-short-confirm",
		
		menuback: "menuback",
		menuhit: "menuhit",
		menubackclick: "menu-back-click",
		menuchartsclick: "menu-charts-click",
		menudirectclick: "menu-direct-click",
		menueditclick: "menu-edit-click",
		menuexitclick: "menu-exit-click",
		menumultiplayerclick: "menu-multiplayer-click",
		menuoptionsclick: "menu-options-click",
		menuplayclick: "menu-play-click",
		pausebackclick: "pause-back-click",
		pausecontinueclick: "pause-continue-click",
		pauseretryclick: "pause-retry-click",
		selectexpand: "select-expand",
		selectdifficulty: "select-difficulty",
		shutter: "shutter",
		
		// hover sounds
		backbuttonhover: "back-button-hover",
		clickshort: "click-short",
		menuclick: "menuclick",
		menubackhover: "menu-back-hover",
		menuchartshover: "menu-charts-hover",
		menudirecthover: "menu-direct-hover",
		menuedithover: "menu-edit-hover",
		menuexithover: "menu-exit-hover",
		menumultiplayerhover: "menu-multiplayer-hover",
		menuoptionshover: "menu-options-hover",
		menuplayhover: "menu-play-hover",
		pausebackhover: "pause-back-hover",
		pausecontinuehover: "pause-continue-hover",
		pauseretryhover: "pause-retry-hover",
		
		// drag sounds
		sliderbar: "sliderbar",
		
		// gameplay sounds
		hitSound {
			standard: {
				normal: {
					hit: "normal-hitnormal",
					clap: "normal-hitclap",
					whistle: "normal-hitwhistle",
					finish: "normal-hitfinish",
					sliderslide: "normal-sliderslide",
					slidertick: "normal-slidertick",
					sliderwhistle: "normal-sliderwhistle",
				},
				drum: {
					hit: "drum-hitnormal",
					clap: "drum-hitclap",
					whistle: "drum-hitwhistle",
					finish: "drum-hitfinish"
					sliderslide: "drum-sliderslide",
					slidertick: "drum-slidertick",
					sliderwhistle: "drum-sliderwhistle",
				},
				soft: {
					hit: "soft-hitnormal",
					clap: "soft-hitclap",
					whistle: "soft-hitwhistle",
					finish: "soft-hitfinish"
					sliderslide: "soft-sliderslide",
					slidertick: "soft-slidertick",
					sliderwhistle: "soft-sliderwhistle",
				}
			},
			taiko: {
				normal: {
					hit: "taiko-normal-hitnormal",
					clap: "taiko-normal-hitclap",
					whistle: "taiko-normal-hitwhistle",
					finish: "taiko-normal-hitfinish",
				},
				drum: {
					hit: "taiko-drum-hitnormal",
					clap: "taiko-drum-hitclap",
					whistle: "taiko-drum-hitwhistle",
					finish: "taiko-drum-hitfinish"
				},
				soft: {
					hit: "taiko-soft-hitnormal",
					clap: "taiko-soft-hitclap",
					whistle: "taiko-soft-hitwhistle",
					finish: "taiko-soft-hitfinish"
				}
			}
		},
		spinnerbonus: "spinnerbonus",
		spinnerspin: "spinnerspin",
		ready: "readys",
		count3: "count3s",
		count2: "count2s",
		count1: "count1s"
		count: "count",
		go: "gos",
		sectionpass: "sectionpass",
		sectionfail: "sectionfail",
		failsound: "failsound",
		combobreak: "combobreak",
		pauseloop: "pause-loop.wav"
	},
	soundFileSuffix: [".wav", ".ogg", ".mp3"],
	imageFileName: {
		// welcome screen
		menubackground: "menu-background",
		welcometext: "welcome_text",
		menusnow: "menu-snow",
		
		// buttons
		menuback: "menu-back",
		menubuttonbackground: "menu-button-background",
		selectionmode: "selection-mode",
		selectionmodeover: "selection-mode-over",
		selectionmods: "selection-mods",
		selectionmodsover: "selection-mods-over",
		selectionrandom: "selection-random",
		selectionrandomover: "selection-random-over",
		selectiontab: "selection-tab",
		star: "star",
		star2: "star",
		
		// mode select
		modeosu: "mode-osu",
		modetaiko: "mode-taiko",
		modefruits: "mode-fruits",
		modemania: "mode-mania",
		modeosumed: "mode-osu-med",
		modetaikomed: "mode-taiko-med",
		modefruitsmed: "mode-fruits-med",
		modemaniamed: "mode-mania-med",
		modeosusmall: "mode-osu-small",
		modetaikosmall: "mode-taiko-small",
		modefruitssmall: "mode-fruits-small",
		modemaniasmall: "mode-maniasmall",
		
		// mod icons
		selectionmodauto: "selection-mod-autoplay",
		selectionmodcinema: "selection-mod-cinema",
		selectionmoddoubletime: "selection-mod-doubletime",
		selectionmodeasy: "selection-mod-easy",
		selectionmodflashlight: "selection-mod-flashlight",
		selectionmodhalftime: "selection-mod-halftime",
		selectionmodhardrock: "selection-mod-hardrock",
		selectionmodhidden: "selection-mod-hidden",
		selectionmodnightcore: "selection-mod-nightcore",
		selectionmodnofail: "selection-mod-nofail",
		selectionmodperfect: "selection-mod-perfect",
		selectionmodrelax: "selection-mod-relax",
		selectionmodautopilot: "selection-mod-relax2",
		selectionmodeasy: "selection-mod-easy",
		selectionmodspunout: "selection-mod-spunout",
		selectionmodsuddendeath: "selection-mod-suddendeath",
		
		// scorebar
		scorebarbg: "scorebar-bg",
	}
}

osuweb.graphics.skin.prototype.constructor = function(filePath) {
	
}