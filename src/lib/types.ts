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
