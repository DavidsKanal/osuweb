import './visuals/ui';
import './visuals/simple_beatmap_selector';
import './menu/song_select/simple_songs_selector';
import './menu/song_select/song_select';
import { baseSkin } from './game/skin/skin';
import { showChooseFile } from './visuals/simple_beatmap_selector';
import { SongSelect } from './menu/song_select/song_select';
import { stage, addRenderingTask } from './visuals/rendering';
import { rootInteractionGroup } from './input/interactivity';
import { globalState } from './global_state';
import { uiEventEmitter } from './visuals/ui';
import { MediaPlayer } from './audio/media_player';
import { mediaAudioNode } from './audio/audio';
import { HighAccuracyMediaPlayer } from './audio/high_accuracy_media_player';
import { GameplayController } from './game/gameplay_controller';
import { addTickingTask } from './util/ticker';
import { BackgroundManager } from './visuals/background';
//import './tests/interactivity_playground';
//import './tests/high_accuracy_media_player_tester';

const osu: string | null = 'ORERU!';

window.addEventListener('load', init);
async function init() {
	await baseSkin.init();

	initAudio();
	initBackground();
	initSongSelect();
	initGameplay();
	showChooseFile();

	console.log(osu!); // Love the syntax <3
}

function initSongSelect() {
	let songSelect = new SongSelect();
	stage.addChild(songSelect.container);
	rootInteractionGroup.add(songSelect.interactionGroup);

	uiEventEmitter.addListener('resize', () => songSelect.resize());
	addRenderingTask((now, dt) => songSelect.update(now, dt));

	globalState.songSelect = songSelect;
}

function initAudio() {
	globalState.basicMediaPlayer = new MediaPlayer(mediaAudioNode);
	globalState.gameplayMediaPlayer = new HighAccuracyMediaPlayer(mediaAudioNode);
}

function initBackground() {
	let manager = new BackgroundManager();
	stage.addChild(manager.container);

	uiEventEmitter.addListener('resize', () => manager.resize());
	addRenderingTask((now) => manager.update(now));
	
	globalState.backgroundManager = manager;
}

function initGameplay() {
	let controller = new GameplayController();
	stage.addChild(controller.container);
	rootInteractionGroup.add(controller.interactionGroup);

	uiEventEmitter.addListener('resize', () => controller.resize());
	addRenderingTask((now) => controller.render(now));
	addTickingTask(() => controller.tick());

	globalState.gameplayController = controller;
}