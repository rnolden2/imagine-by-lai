export interface Story {
	id: number;
	prompt: string;
	content: string;
	image_url: string | null;
	image_object_name?: string | null;
	grade_level: string;
	lesson_id: number | null;
	child_id: number | null; // Renamed from user_id
	user_id?: number | null; // Backwards compatibility alias
	created_at: string;
}

export interface ChildProfile {
	id: number;
	name: string;
	grade: string;
	gender: 'boy' | 'girl';
	character_description: string | null;
	story_themes: string[]; // postgres text[] array
	story_length_minutes: number;
}

// Backwards compatibility alias for User
export type User = ChildProfile;

export interface Lesson {
	id: number;
	lesson: string;
}

export interface MathSettings {
	id: number;
	child_id: number; // Renamed from user_id
	user_id?: number; // Backwards compatibility alias
	operations: string[]; // postgres text[] array (addition, subtraction, etc.)
	config: Record<string, unknown>; // JSONB config is validated before use.
	updated_at: string;
}

export interface MathAttempt {
	id: number;
	child_id: number | null; // Renamed from user_id
	user_id?: number | null; // Backwards compatibility alias
	session_id: string;
	operation: string;
	problem_state: Record<string, unknown>; // JSONB problem details are validated before use.
	correct_answer: string;
	given_answer: string;
	is_correct: boolean;
	created_at: string;
}

export interface MathSessionSummary {
	child_id: number | null;
	child_name: string | null; // Renamed from user_name
	user_name?: string | null; // Backwards compatibility alias
	session_id: string;
	started_at: string;
	total: number;
	correct: number;
}

export interface SpellingWord {
	id: number;
	word: string;
	grade: string;
	created_at: string;
}

export interface SpellingAttempt {
	id: number;
	child_id: number | null;
	session_id: string;
	word: string;
	grade: string;
	attempts_used: number;
	is_correct: boolean;
	created_at: string;
}

export interface SpellingSessionSummary {
	child_id: number | null;
	child_name: string | null; // Renamed from user_name
	user_name?: string | null; // Backwards compatibility alias
	session_id: string;
	started_at: string;
	total: number;
	correct: number;
	grade: string;
}
