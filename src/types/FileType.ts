export type FileType = {
    language: string;
    extension: string;
    /** Versión del lenguaje. Un lenguaje con varias versiones aparece una vez por versión. */
    version?: string;
}
