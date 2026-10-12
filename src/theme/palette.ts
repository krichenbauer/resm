/** The colors of one appearance. */
export interface Palette {
  /** Background of the page and the diagram. */
  readonly surface: string;
  /** Background of the controls at the top. */
  readonly panel: string;
  readonly border: string;
  readonly text: string;
  readonly focus: string;
  readonly error: string;
  /** Outlines of states, and edges. */
  readonly line: string;
  /** Fill of states. */
  readonly state: string;
}

export const LIGHT: Palette = {
  surface: '#ffffff',
  panel: '#f3f4f6',
  border: '#c5c9d1',
  text: '#16181d',
  focus: '#1d4ed8',
  error: '#b42318',
  line: '#30343c',
  state: '#ffffff',
};

export const DARK: Palette = {
  surface: '#16181d',
  panel: '#20232a',
  border: '#3a3f4a',
  text: '#e8eaed',
  focus: '#93b4ff',
  error: '#ff9a8f',
  line: '#c9cdd4',
  state: '#20232a',
};
