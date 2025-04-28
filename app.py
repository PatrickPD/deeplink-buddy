import streamlit as st
# import google.generativeai as genai # No longer needed directly here
import os
from PIL import Image
import io
import json
import re
import requests # Import requests library
import base64  # Add this for encoding images

# --- Configuration ---
PAGE_TITLE = "Deeplink Helper"
LOGO_PATH = "logo.png" # Make sure logo.png is in the same folder
SCREENSHOT_DIR = "screenshots"


# --- NO LONGER NEEDED: INSTRUCTIONS (Now lives in Genkit backend) ---
# INSTRUCTIONS = """..."""

# --- Get Genkit API Endpoint URL from Secrets ---
try:
    # Store the base URL of your deployed Genkit API
    GENKIT_API_BASE_URL = st.secrets["GENKIT_API_BASE_URL"]
    # st.info(f"Secret: GENKIT_API_BASE_URL: {GENKIT_API_BASE_URL}")
    # Example: "https://your-genkit-app-hash-uc.a.run.app" or "http://localhost:3400"
except KeyError:
    st.error("Error: GENKIT_API_BASE_URL not found in Streamlit secrets.")
    st.info("Please add the URL of your deployed Genkit API endpoint to Streamlit secrets.")
    st.stop()
except Exception as e:
    st.error(f"Error reading secrets: {e}")
    st.stop()


# --- NO LONGER NEEDED: GENAI CONFIG (unless used elsewhere) ---
# def configure_gemini():
#     try:
#         # Make sure GEMINI_API_KEY is set in Streamlit secrets
#         api_key = st.secrets["GEMINI_API_KEY"]
#         genai.configure(api_key=api_key)
#         model = genai.GenerativeModel('gemini-1.5-flash-latest')
#         return model
#     except KeyError:
#         st.error("Error: GEMINI_API_KEY not found in Streamlit secrets.")
#         st.info("Please add your Gemini API Key to the Streamlit secrets configuration.")
#         st.stop()
#     except Exception as e:
#         st.error(f"Error configuring Gemini API: {e}")
#         st.stop()

# --- Initialize Session State ---
if "messages" not in st.session_state:
    st.session_state.messages = []
if "current_image" not in st.session_state:
    st.session_state.current_image = None
# image_processed_this_turn might be less relevant now if backend handles indication
# if "image_processed_this_turn" not in st.session_state:
#     st.session_state.image_processed_this_turn = False
if "last_uploaded_file_id" not in st.session_state:
    st.session_state.last_uploaded_file_id = None # Track the ID of the last processed upload


# --- Streamlit App Layout ---
st.set_page_config(page_title=PAGE_TITLE, page_icon=LOGO_PATH)

# Sidebar
with st.sidebar:
    if os.path.exists(LOGO_PATH):
        st.image(LOGO_PATH, width=100)
    st.header("Upload Image (Optional)")
    uploaded_file = st.file_uploader(
        "Upload an image to discuss in your next message.",
        type=["png", "jpg", "jpeg"],
        key="file_uploader"
    )

    # Process the uploaded file only if it's a new file
    if uploaded_file is not None and uploaded_file.file_id != st.session_state.last_uploaded_file_id:
        try:
            image_bytes = uploaded_file.getvalue()
            pil_image = Image.open(io.BytesIO(image_bytes))
            st.session_state.current_image = pil_image # Store the image for the next message
            st.session_state.last_uploaded_file_id = uploaded_file.file_id # Mark this file ID as processed
            # st.session_state.image_processed_this_turn = False # Less relevant now
        except Exception as e:
            st.error(f"Error processing image: {e}")
            st.session_state.current_image = None
            st.session_state.last_uploaded_file_id = None

    # Display the currently active image in the sidebar if one exists
    if st.session_state.current_image is not None:
        st.image(st.session_state.current_image, caption="Image ready for next message", use_column_width=True)

    # Option to clear conversation / start new flow
    if st.button("Start New Conversation"):
        st.session_state.messages = []
        st.session_state.current_image = None
        st.session_state.last_uploaded_file_id = None
        st.rerun()

# Main Chat Interface
st.title(PAGE_TITLE)
st.caption("Chat about deeplinks, tracking links, push notifications, and QR codes (Powered by Genkit Agent)")

# --- NO LONGER NEEDED: Configure Gemini Model ---
# model = configure_gemini()

# Display chat messages from history (Screenshot parsing logic is the same)
for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        content = message["content"] # Assuming 'content' key holds the text
        # Process screenshot marker if it's a model response
        if message["role"] == "model":
            text_to_display = ""
            screenshot_path = None
            # Check for screenshot marker using regex
            match = re.match(r"^\s*\[SHOW_SCREENSHOT:\s*(.*?)\s*\](.*)", content, re.DOTALL | re.IGNORECASE)
            if match:
                filename = match.group(1).strip()
                text_to_display = match.group(2).strip()
                potential_path = os.path.join(SCREENSHOT_DIR, filename)
                if os.path.exists(potential_path):
                    screenshot_path = potential_path
                else:
                    st.warning(f"Screenshot file not found: {potential_path}")
            else:
                text_to_display = content # No marker found

            # Display screenshot if found
            if screenshot_path:
                try:
                    st.image(screenshot_path, width=300) # Adjust width as needed
                except Exception as e:
                    st.warning(f"Could not display screenshot {screenshot_path}: {e}")

            # Display the text part (even if screenshot wasn't found or failed)
            if text_to_display:
                 st.markdown(text_to_display)
            elif not screenshot_path: # Display original content if no marker and no text extracted
                 st.markdown(content)


        elif message["role"] == "user":
            # Display user message
            # For simplicity, just showing text here.
            # TODO: Consider how to display associated image if sent with user message.
            st.markdown(content)
        else: # Handle other potential roles like 'tool' if needed
            st.markdown(f"*{message['role']}*: {content}")


# React to user input using chat_input
if prompt := st.chat_input("What deeplink or analysis do you need?"):
    # 1. Add user message to state immediately for display
    st.session_state.messages.append({"role": "user", "content": prompt})
    
    # 2. Prepare data for the Genkit API endpoint
    # Check if we have an image to include
    payload = None
    
    if st.session_state.current_image:
        # Convert image to base64
        buf = io.BytesIO()
        st.session_state.current_image.save(buf, format="PNG")
        img_b64 = base64.b64encode(buf.getvalue()).decode()
        
        # Create payload with text and image
        payload = {
            "data": {
                "text": prompt,
                "uploadedImage": img_b64
            }
        }
        
        # Clear image after sending
        st.session_state.current_image = None
    else:
        # No image, just send text
        payload = {"data": prompt}

    api_endpoint = f"{GENKIT_API_BASE_URL}/deeplinkHelperFlow"
    headers = {'Content-Type': 'application/json'}

    print(f"Calling Genkit API: {api_endpoint}")
    if isinstance(payload["data"], dict):
        print(f"Sending text with uploaded image")
    else:
        print(f"Sending text only: {payload['data']}")

    # 3. Make the HTTP request
    model_response_content = None
    try:
        with st.spinner("Assistant is thinking..."):
            response = requests.post(
                api_endpoint, 
                headers=headers, 
                json=payload, 
                timeout=120
            )
            response.raise_for_status()

            response_data = response.json()
            print(f"API Response status: {response.status_code}")

            if "result" in response_data:
                model_response_content = response_data["result"]
            else:
                st.error("API response missing 'result' field.")
                model_response_content = "Error: Received unexpected data from the assistant."

    except requests.exceptions.RequestException as e:
        st.error(f"Network or API error: {e}")
        model_response_content = f"Sorry, I couldn't connect to the assistant. Please check the API connection. Error: {e}"
    except json.JSONDecodeError:
        st.error(f"API returned non-JSON response: {response.text}")
        model_response_content = f"Sorry, the assistant returned an invalid response."
    except Exception as e:
        st.error(f"An error occurred: {e}")
        model_response_content = f"Sorry, an unexpected error occurred: {e}"

    # 4. Add model response (or error message) to state
    if model_response_content:
        st.session_state.messages.append({"role": "model", "content": model_response_content})

    # 5. Rerun Streamlit to display the new messages
    st.rerun()

# --- REMOVED: Old Gemini API call logic ---
# ... (code that prepared api_payload and called model.generate_content) ...
# ... (code that processed response and cleared image state based on Gemini call) ...
