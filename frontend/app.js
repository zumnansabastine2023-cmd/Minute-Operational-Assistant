const startButton = document.getElementById("startMeeting");
const transcript = document.getElementById("transcript");

startButton.addEventListener("click", async function () {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        transcript.textContent =
            "Meeting audio captured. Ready for live transcription...";

        console.log("Audio capture started:", stream);

    } catch (error) {
        transcript.textContent =
            "Meeting capture was cancelled or unavailable.";

        console.error(error);
    }
});