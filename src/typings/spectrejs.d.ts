
declare module 'spectorjs' {

    //export * from SPECTOR;

    class Spector {
        constructor();
        public displayUI(disableTracking: boolean = false);
        public spyCanvases(): void;
        public captureCanvas(canvas: HTMLCanvasElement): void;
        public static getFirstAvailable3dContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGLRenderingContexts;
        public readonly onCaptureStarted: Observable<any>;
        public readonly onCapture: Observable<ICapture>;
        public readonly onError: Observable<string>;
        public getResultUI(): ResultView;
        public getCaptureUI(): CaptureMenu;
        public rebuildProgramFromProgramId(programId: number,
            vertexSourceCode: string,
            fragmentSourceCode: string,
            onCompiled: (program: WebGLProgram) => void,
            onError: (message: string) => void): void;
        public rebuildProgram(program: WebGLProgram,
            vertexSourceCode: string,
            fragmentSourceCode: string,
            onCompiled: (program: WebGLProgram) => void,
            onError: (message: string) => void): void;
        public referenceNewProgram(programId: number, program: WebGLProgram): void;
        public pause(): void;
        public play(): void;
        public playNextFrame(): void;
        public drawOnlyEveryXFrame(x: number): void;
        public getFps(): number;
        public spyCanvases(): void;
        public spyCanvas(canvas: HTMLCanvasElement | OffscreenCanvas): void;
        public getAvailableContexts(): IAvailableContext[]
        public captureCanvas(canvas: HTMLCanvasElement | OffscreenCanvas,
            commandCount = 0,
            quickCapture: boolean = false,
            fullCapture: boolean = false): void;
        public captureContext(context: WebGLRenderingContexts,
            commandCount = 0,
            quickCapture: boolean = false,
            fullCapture: boolean = false): void;
        public captureContextSpy(contextSpy: ContextSpy,
            commandCount = 0,
            quickCapture: boolean = false,
            fullCapture: boolean = false): void;
        public captureNextFrame(obj: HTMLCanvasElement | OffscreenCanvas | WebGLRenderingContexts,
            quickCapture: boolean = false,
            fullCapture: boolean = false): void;
        public startCapture(obj: HTMLCanvasElement | OffscreenCanvas | WebGLRenderingContexts,
            commandCount: number,
            quickCapture: boolean = false,
            fullCapture: boolean = false): void;
        public stopCapture(): ICapture;
        public setMarker(marker: string): void;
        public clearMarker(): void;
        public log(value: string): void;
    }

    interface ISourceCodeChangeEvent {
        sourceVertex: string;
        sourceFragment: string;
        translatedSourceVertex: string;
        translatedSourceFragment: string;
        programId: number;
    }

    class ResultView {
        public readonly onSourceCodeChanged: Observable<ISourceCodeChangeEvent>;
        constructor(private readonly rootPlaceHolder: Element = null);
        public saveCapture(capture: ICapture): void;
        public selectCapture(captureStateId: number): void;
        public selectCommand(commandStateId: number): void;
        public selectVisualState(visualStateId: number): void;
        public display(): void;
        public hide(): void;
        public addCapture(capture: ICapture): number;
        public showSourceCodeError(error: string): void;
    }


    interface ICanvasInformation {
        id: string;
        width: number;
        height: number;
        ref: any;
    }
    interface ICaptureMenu {
        readonly onCanvasSelected: IEvent<ICanvasInformation>;
        readonly onCaptureRequested: IEvent<ICanvasInformation>;
        readonly onPauseRequested: IEvent<ICanvasInformation>;
        readonly onPlayRequested: IEvent<ICanvasInformation>;
        readonly onPlayNextFrameRequested: IEvent<ICanvasInformation>;
        display(): void;
        trackPageCanvases(): void;
        updateCanvasesList(canvases: NodeListOf<HTMLCanvasElement>): void;
        updateCanvasesListInformation(canvasesInformation: ICanvasInformation[]): void;
        getSelectedCanvasInformation(): ICanvasInformation;
        hide(): void;
        captureComplete(errorText: string): void;
        setFPS(fps: number): void;
    }
    interface ICaptureMenuOptions {
        readonly eventConstructor: EventConstructor;
        readonly rootPlaceHolder?: Element;
        readonly canvas?: HTMLCanvasElement;
        readonly hideLog?: boolean;
    }
    type CaptureMenuConstructor = {
        new(options: ICaptureMenuOptions, logger: ILogger): ICaptureMenu;
    };

    interface IAvailableContext {
        readonly canvas: HTMLCanvasElement | OffscreenCanvas;
        readonly contextSpy: ContextSpy;
    }

    class ContextSpy {
        public readonly context: WebGLRenderingContexts;
        public readonly version: number;
        public readonly onMaxCommand: Observable<ContextSpy>;
        public spy(): void;
        public unSpy(): void;
        public startCapture(maxCommands = 0, quickCapture = false, fullCapture = false): void;
        public stopCapture(): ICapture
        public isCapturing(): boolean;
        public setMarker(marker: string): void;
        public clearMarker(): void;
        public log(value: string): void;
        public getNextCommandCaptureId(): number
        public onCommand: any; // (commandSpy: CommandSpy, functionInformation: IFunctionInformation): void;
    }

    interface ICapture {
        canvas: ICanvasCapture;
        context: IContextCapture;
        initState: State;
        commands: ICommandCapture[];
        endState: State;
        startTime: number;
        listenCommandsStartTime: number;
        listenCommandsEndTime: number;
        endTime: number;
        analyses: IAnalysis[];
        frameMemory: { [objectName: string]: number };
        memory: { [objectName: string]: { [second: number]: number } };
    }

    interface ICanvasCapture {
        width: number;
        height: number;
        clientWidth: number;
        clientHeight: number;
        browserAgent: string;
    }

    type State = { [stateName: string]: any };

    type CommandCapturedCallback = (command: ICommandCapture) => void;

    type CommandCapturedCallbacks = { [name: string]: CommandCapturedCallback[] };

    const enum CommandCaptureStatus {
        Unknown = 0,
        Unused = 10,
        Disabled = 20,
        Redundant = 30,
        Valid = 40,
        Deprecated = 50,
    }

    interface ICommandCapture extends State {
        id: number;
        startTime: number;
        commandEndTime: number;
        endTime: number;
        name: string;
        commandArguments: IArguments;
        result: any;
        stackTrace: string[];
        status: CommandCaptureStatus;
        text: string;
        marker: string;
        consumeCommandId?: number;
        [stateName: string]: any;
    }


    class Observable<T> {
        public add(callback: (element: T) => void, context?: any): number;
        public remove(id: number): void;
        public clear(): void;
        public trigger(value: T): void;
    }


    type WebGLRenderingContexts = (WebGLRenderingContext | WebGL2RenderingContext);

    type ExtensionList = { [key: string]: any };

    interface IContextInformation {
        readonly context: WebGLRenderingContexts;
        readonly contextVersion: number;
        readonly toggleCapture?: (capture: boolean) => void;
        readonly tagWebGlObject?: (object: any) => WebGlObjectTag;
        readonly extensions?: ExtensionList;
    }

    type CaptureMenu = ICaptureMenu;
    type CommandCaptureStatus = any;
    type CommandCapturedCallback = any;
    type IAnalysis = any;
    type WebGlObjectTag = any;
    type ICapture = any;

}


declare type OffscreenCanvas = HTMLCanvasElement;
declare var OffscreenCanvas: {
    prototype: OffscreenCanvas;
    new(): OffscreenCanvas;
};
interface Window {
    OffscreenCanvas: OffscreenCanvas;
}
declare type WebGLObject = {};