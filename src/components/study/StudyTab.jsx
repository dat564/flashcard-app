import QuizView from "./QuizView";
import SessionView from "./SessionView";
import StartScreen from "./StartScreen";

export default function StudyTab({ study, quizApi, data, speech, ...startProps }) {
  return (
    <section className="study">
      {quizApi.quiz ? (
        <QuizView api={quizApi} speech={speech} />
      ) : study.session.length > 0 && study.current ? (
        <SessionView study={study} data={data} speech={speech} />
      ) : (
        <StartScreen
          study={study}
          data={data}
          quizApi={quizApi}
          {...startProps}
        />
      )}
    </section>
  );
}
