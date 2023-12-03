import { ConvexAiChat } from "@/aiChat";
import { Button } from "@/components/ui/button";

function App() {

  return (
    <main className="container max-w-2xl flex flex-col gap-8 w-full">
      <h1 className="text-4xl font-extrabold my-8 text-center text-black">
        An Adventurer's Guide to Kiln
      </h1>
      <section className="flex flex-col justify-center items-center w-full">
        <ConvexAiChat
          convexUrl={import.meta.env.VITE_CONVEX_URL as string}
          name="The oracle"
          infoMessage="The oracles suggestions are subject to interpretation."
          welcomeMessage="I am the oracle of Kiln. Ask me anything."
          renderTrigger={(onClick) => (
            <Button className="absolute bottom-6 right-6" onClick={onClick}>Show Chat</Button>
          )}
        />
      </section>
    </main>
  );
}

export default App;
