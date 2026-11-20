import QuizView from "./QuizView";
import SessionSummary from "./SessionSummary";
import SessionView from "./SessionView";
import StartScreen from "./StartScreen";

export default function StudyTab({ study, quizApi, data, speech, ...startProps }) {
  return (
    <section className="study">
      {quizApi.quiz ? (
        <QuizView api={quizApi} speech={speech} />
      ) : study.session.length > 0 && study.current ? (
        <SessionView study={study} data={data} speech={speech} />
      ) : study.summary ? (
        <SessionSummary
          summary={study.summary}
          data={data}
          speech={speech}
          streak={startProps.streak}
          week={startProps.week}
          onDone={study.dismissSummary}
          onMore={() => study.startStudy("more")}
        />
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
