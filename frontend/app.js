const startButton = document.getElementById("startMeeting");
const stopButton = document.getElementById("stopMeeting");
const transcript = document.getElementById("transcript");
const meetingStatus = document.getElementById("meetingStatus");

let meetingStream = null;

startButton.addEventListener("click", async function () {
    try {
        meetingStream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true
        });

        transcript.textContent =
    "Meeting audio captured. Meeting is now in progress...";

meetingStatus.textContent = "Meeting in Progress";
        startButton.disabled = true;
        stopButton.disabled = false;

        console.log("Meeting started:", meetingStream);

    } catch (error) {
        transcript.textContent =
            "Meeting capture was cancelled or unavailable.";

        console.error(error);
    }
});

stopButton.addEventListener("click", function () {
    if (meetingStream) {
        meetingStream.getTracks().forEach(function (track) {
            track.stop();
        });

        meetingStream = null;
    }

    transcript.textContent =
    "Meeting stopped. Ready for the next meeting.";

meetingStatus.textContent = "Meeting Stopped";

    startButton.disabled = false;
    stopButton.disabled = true;

    console.log("Meeting stopped.");
});