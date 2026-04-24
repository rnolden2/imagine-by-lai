export interface Story {
	id: number;
	prompt: string;
	content: string;
	image_url: string | null;
	grade_level: string;
	lesson_id: number | null;
	user_id: number | null;
	created_at: string;
}

export interface User {
	id: number;
	name: string;
	grade: string;
	gender: 'boy' | 'girl';
}

export interface Lesson {
	id: number;
	lesson: string;
}

export interface MathSettings {
	id: number;
	user_id: number;
	operations: string; // comma-separated: addition,subtraction,multiplication,division
	max_number: number;
	updated_at: string;
}

export interface MathAttempt {
	id: number;
	user_id: number | null;
	session_id: string;
	operation: string;
	num1: number;
	num2: number;
	correct_answer: number;
	given_answer: number;
	is_correct: number; // 0 or 1
	created_at: string;
}

export interface MathSessionSummary {
	user_name: string | null;
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

export interface SpellingSessionSummary {
	user_name: string | null;
	session_id: string;
	started_at: string;
	total: number;
	correct: number;
	grade: string;
}
