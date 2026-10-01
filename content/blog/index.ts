// Every published article. To add one: create a file next to this one that
// default-exports a BlogPost (copy an existing article), then import it and
// add it to the list below. lib/blog.ts sorts by date, newest first, and
// tests/unit/blog.test.ts checks slugs, dates and descriptions.

import type { BlogPost } from "../../lib/blog";
import chooseMathsTutorCbseClass10 from "./choose-maths-tutor-cbse-class-10";
import homeTutorVsCoachingCentre from "./home-tutor-vs-coaching-centre";
import getMoreStudentsAsAHomeTutor from "./get-more-students-as-a-home-tutor";

export const posts: BlogPost[] = [
  chooseMathsTutorCbseClass10,
  homeTutorVsCoachingCentre,
  getMoreStudentsAsAHomeTutor,
];
